from quart import Blueprint, request, websocket
from agent_session import AgentSession
from agent import ScienceAgent
from broker import broker
from container import Container
from storage import Storage
from llm_engine import LLMEngine
import json
import asyncio
import traceback
import config
import os

execution_blueprint = Blueprint('execution', __name__)

class AgentWebSocketConnection:
    def __init__(self, agent_session: AgentSession):
        self.agent_session = agent_session
        self.container = Container(self.agent_session)
        self.agent = ScienceAgent(self.agent_session)
        self.cancellable_task = None
        self.running_commands = []

    async def init(self):
        await self.container.make_dirs()

    def get_llm_engine(self, data: dict):
        if data.get("llm_engine_name") and data.get("llm_api_key"):
            llm_engine = LLMEngine(data.get("llm_engine_name"), api_key=data.get("llm_api_key"), base_url=data.get("llm_base_url"))
        else:
            llm_engine = LLMEngine(config.LLM_ENGINE_NAME, api_key=os.getenv('LLM_API_KEY'), base_url=config.LLM_BASE_URL)
        return llm_engine

    async def execute_command(self, command: str, data: dict):
        if command == 'solve_task':
            await self.agent.solve_task(
                self.container,
                self.get_llm_engine(data),
                data.get("use_self_debug", True),
            )
        elif command == 'follow_up':
            await self.agent.ask_follow_up(
                data.get("message"),
                data.get("code_id"),
                self.container,
                self.get_llm_engine(data),
                data.get("use_self_debug", True),
            )
        elif command == 'run_program':
            await self.agent.execute(
                data.get("id"),
                self.container,
            )
        elif command == 'update_program':
            id = data.get("id")
            await self.agent_session.update_code_file(
                id,
                data.get("user_content"),
            )
        elif command == 'update_task_inputs':
            await self.agent_session.update_inputs(
                data["task_instruction"],
                data["domain_knowledge"],
                data["description"],
            )
        elif command == 'clear':
            await self.agent_session.clear()
        elif command == 'cancel':
            if self.cancellable_task:
                self.cancellable_task.set_name("cancelled")
                self.cancellable_task.cancel()
        else:
            return {"type": "error", "message": "Unknown command"}

    def handle_message(self, data: dict):
        command = data['command']
        command_id = data['command_id']

        async def _run():
            try:
                result = await self.execute_command(command, data)
                if not result:
                    result = {}
                result["command_id"] = command_id
                await broker.publish(self.agent_session.id, result)
            except asyncio.CancelledError:
                print("Command cancelled:", command, command_id)
                if self.cancellable_task and self.cancellable_task.get_name() == "cancelled":
                    await broker.publish(self.agent_session.id, { "type": "error", "message": "Command cancelled", "command_id": command_id })
                    self.cancellable_task = None
                else:
                    raise
            except Exception as e:
                print("Error while executing command:", command)
                traceback.print_exc()
                await broker.publish(self.agent_session.id, {"type": "error", "message": "Internal server error", "command_id": command_id})

        new_task = asyncio.create_task(_run())

        if command in ['solve_task', 'follow_up', 'run_program']:
            if self.cancellable_task:
                self.cancellable_task.cancel()
            self.cancellable_task = new_task

        new_task.add_done_callback(lambda task: self.running_commands.remove(task))
        self.running_commands.append(new_task)

    async def close(self):
        for task in self.running_commands:
            task.cancel()
        await self.container.destroy()


@execution_blueprint.websocket("/ws/<string:agent_session_id>")
async def ws(agent_session_id: str):
    try:
        agent_session = AgentSession(agent_session_id)
        initial_state = await agent_session.get()
        if not initial_state:
            return {"error": "Invalid Agent Session ID"}, 403
        if initial_state.get('metadata', {}).get('source') != 'user':
            return {"error": "Only user sessions can be modified"}, 403
    except Exception as e:
        print("Error getting session state:", e)
        return {"error": "Internal server error"}, 403

    # Send the initial session state to the client
    response = {
        "type": "state",
        "state": initial_state,
        "has_default_llm": bool(config.LLM_ENGINE_NAME),
    }
    await websocket.send(json.dumps(response))

    connection = AgentWebSocketConnection(agent_session)
    await connection.init()

    async def _receive():
        while True:
            message = await websocket.receive()
            print(f"Session {agent_session_id} command: {message}")
            connection.handle_message(json.loads(message))

    async def _send():
        async for message in broker.subscribe(agent_session_id):
            await websocket.send(json.dumps(message))

    try:
        print("WebSocket connection established for session", agent_session_id)
        receive_task = asyncio.create_task(_receive(), name=f"ws-{agent_session_id}-receive")
        send_task = asyncio.create_task(_send(), name=f"ws-{agent_session_id}-send")
        await asyncio.wait([receive_task, send_task], return_when=asyncio.FIRST_COMPLETED)
    except Exception as e:
        print(e)
        websocket.close()
        raise e
    finally:
        print(f"WebSocket connection closed for session {agent_session_id}.")
        if not send_task.done():
            send_task.cancel()
        if not receive_task.done():
            receive_task.cancel()
        await connection.close()


@execution_blueprint.route("/agent_session", methods=["POST"])
async def create_session():
    agent_session_id = await AgentSession.create()
    return { "agent_session_id": agent_session_id }


@execution_blueprint.route("/agent_session/validate", methods=["POST"])
async def validate_session():
    data = await request.json
    agent_session_id = data.get("agent_session_id")
    initial_state = await AgentSession(agent_session_id).get()
    if not initial_state:
        return {"error": "Invalid Agent Session ID"}, 404
    if initial_state.get('metadata', {}).get('source') != 'user':
        return {"error": "Only user sessions can be modified"}, 400
    return { "message": "Valid session" }


@execution_blueprint.route("/upload/<string:agent_session_id>", methods=["POST"])
async def upload_file(agent_session_id: str):
    if not agent_session_id:
        return {"error": "No Agent Session ID provided."}, 400
    files = await request.files
    if 'file' not in files:
        return {"error": "No file part in the request"}, 400
    file = files['file']
    if file.name == '' or not file:
        return {"error": "No selected file"}, 400

    object_name = f"{agent_session_id}/{file.filename}"
    await Storage.upload_file_stream(file, object_name)
    file_size = request.content_length or 0
    file_info = {'name': file.filename, 'size': file_size, 'object_name': object_name, 'source': 'user'}
    await AgentSession(agent_session_id).add_uploaded_file(file_info)

    return file_info


@execution_blueprint.route("/upload/<string:agent_session_id>/<string:filename>", methods=["DELETE"])
async def remove_file(agent_session_id: str, filename: str):
    if not agent_session_id:
        return {"error": "No Agent Session ID provided."}, 400

    file = await AgentSession(agent_session_id).remove_uploaded_file(filename)

    # Only delete user-uploaded files, not preloaded dataset files
    if file and file.get('source') == 'user':
        await Storage.remove_file(file.get('object_name'))

    return {"message": "File deleted."}
