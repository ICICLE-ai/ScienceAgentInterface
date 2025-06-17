from quart import Blueprint, request, websocket
from agent_session import AgentSession
from agent import ScienceAgent
from broker import broker
from container import Container
import json
import asyncio
import traceback
import config

execution_blueprint = Blueprint('execution', __name__)

class AgentWebSocketConnection:
    def __init__(self, agent_session_id):
        self.agent_session_id = agent_session_id
        self.container = Container(agent_session_id)
        self.agent = ScienceAgent(agent_session_id, config.LLM_ENGINE_NAME)
        self.cancellable_task = None
        self.running_commands = []

    async def init(self):
        await self.container.make_dirs()

    async def execute_command(self, command, data):
        if command == 'solve_task':
            await asyncio.create_task(self.agent.solve_task(self.container, data.get("use_self_debug", True)))
        elif command == 'follow_up':
            await asyncio.create_task(self.agent.ask_follow_up(data.get("message"), data.get("code_id")))
        elif command == 'run_program':
            await asyncio.create_task(self.agent.execute(data.get("id"), self.container))
        elif command == 'update_program':
            id = data.get("id")
            return await AgentSession.update_code_file(self.agent_session_id, id, data.get("user_content"))
        elif command == 'update_task_inputs':
            await AgentSession.update_inputs(
                self.agent_session_id,
                data["task_instruction"],
                data["domain_knowledge"],
                data["description"],
            )
        elif command == 'clear':
            await AgentSession.clear(self.agent_session_id)
        elif command == 'cancel':
            if self.cancellable_task:
                self.cancellable_task.set_name("cancelled")
                self.cancellable_task.cancel()
        else:
            return {"type": "error", "message": "Unknown command"}

    def handle_message(self, data):
        command = data['command']
        command_id = data['command_id']

        async def _run():
            try:
                result = await self.execute_command(command, data)
                if not result:
                    result = {}
                result["command_id"] = command_id
                await broker.publish(self.agent_session_id, result)
            except asyncio.CancelledError:
                print("Command cancelled:", command, command_id)
                if self.cancellable_task and self.cancellable_task.get_name() == "cancelled":
                    await broker.publish(self.agent_session_id, { "type": "error", "message": "Command cancelled", "command_id": command_id })
                    self.cancellable_task = None
                else:
                    raise
            except Exception as e:
                print("Error while executing command:", command)
                traceback.print_exc()
                await broker.publish(self.agent_session_id, {"type": "error", "message": "Internal server error", "command_id": command_id})

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
async def ws(agent_session_id):
    try:
        initial_state = await AgentSession.get(agent_session_id)
        if not initial_state:
            return {"error": "Invalid Agent Session ID"}, 403
        if initial_state.get('metadata', {}).get('source') != 'user':
            return {"error": "Only user sessions can be modified"}, 403
    except Exception as e:
        print("Error getting session state:", e)
        return {"error": "Internal server error"}, 403

    # Send the initial session state to the client
    await websocket.send(json.dumps({"type": "state", "state": initial_state}))

    connection = AgentWebSocketConnection(agent_session_id)
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
    initial_state = await AgentSession.get(agent_session_id)
    if not initial_state:
        return {"error": "Invalid Agent Session ID"}, 404
    if initial_state.get('metadata', {}).get('source') != 'user':
        return {"error": "Only user sessions can be modified"}, 400
    return { "message": "Valid session" }


@execution_blueprint.route("/upload/<string:agent_session_id>", methods=["POST"])
async def upload_file(agent_session_id):
    if not agent_session_id:
        return {"error": "No Agent Session ID provided."}, 400
    files = await request.files
    if 'file' not in files:
        return {"error": "No file part in the request"}, 400
    file = files['file']
    if file.name == '' or not file:
        return {"error": "No selected file"}, 400

    file_info = await AgentSession.upload_file(agent_session_id, file, request.content_length)

    return file_info


@execution_blueprint.route("/upload/<string:agent_session_id>/<string:filename>", methods=["DELETE"])
async def remove_file(agent_session_id, filename):
    if not agent_session_id:
        return {"error": "No Agent Session ID provided."}, 400

    await AgentSession.remove_uploaded_file(agent_session_id, filename)

    return {"message": "File deleted."}
