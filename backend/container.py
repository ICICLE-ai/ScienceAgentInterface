from typing import Optional
import os
import time
import sys
import aiodocker
import asyncio
from aioshutil import rmtree, sync_to_async
from typing import Optional
from broker import broker
from agent_session import AgentSession

SESSION_DIR = './agent_sessions'
PIP_CACHE_DIR = './agent_sessions/pip_cache'

docker: aiodocker.Docker = None

def initialize_docker():
    global docker
    if docker is None:
        docker = aiodocker.Docker()
    return docker

class Container:
    def __init__(self, agent_session: AgentSession):
        self.container = None
        self.is_running = False
        self.agent_session = agent_session

    def get_session_dir(self):
        return os.path.join(SESSION_DIR, self.agent_session.id)

    def get_eval_dir(self):
        return os.path.join(SESSION_DIR, self.agent_session.id, 'eval')

    def get_output_cache_dir(self):
        return os.path.join(SESSION_DIR, self.agent_session.id, 'pred_results')

    def get_uploads_dir(self):
        return os.path.join(SESSION_DIR, self.agent_session.id, 'uploads')

    @sync_to_async
    def make_dirs(self):
        os.makedirs(self.get_session_dir(), exist_ok=True)
        os.makedirs(self.get_eval_dir(), exist_ok=True)
        os.makedirs(self.get_output_cache_dir(), exist_ok=True)
        os.makedirs(self.get_uploads_dir(), exist_ok=True)
        os.makedirs(PIP_CACHE_DIR, exist_ok=True)

        #if sys.platform == "linux":
        #    # Set sci-agent ownership so the container can access mounted directories
        #    uid = 1000
        #    gid = 1000
        #    os.chown(self.get_eval_dir(), uid, gid)
        #    os.chown(self.get_uploads_dir(), uid, gid)
        #    os.chown(PIP_CACHE_DIR, uid, gid)

    async def start(self):
        if self.is_running:
            return

        initialize_docker()

        if self.container:
            await self.container.start()
            self.is_running = True
            return

        print("Creating container for", self.agent_session.id)

        config = {
            "Image": "science-agent",
            "HostConfig": {
                "Binds": [
                    f"{os.path.abspath(self.get_eval_dir())}:/workspace",
                    f"{os.path.abspath(self.get_uploads_dir())}:/uploads",
                    f"{os.path.abspath(PIP_CACHE_DIR)}:/home/sci-agent/.cache/pip",
                ],
                "SecurityOpt": ["label=disable"],
            },
            "WorkingDir": "/workspace",
            "User": f"{uid}:{gid}"
        }
        self.container = await docker.containers.create_or_replace(
            name=f"science-agent-{self.agent_session.id}",
            config=config,
        )
        await self.container.start()
        self.is_running = True

    async def destroy(self):
        if self.container is None:
            return

        await self.container.stop()
        await self.container.delete()
        print("Stopped container:", self.container.id)

        #await rmtree(self.get_session_dir(), ignore_errors=True)

    async def stop(self):
        if self.container is None:
            return

        await self.container.stop()
        self.is_running = False

    async def run_command(self, command: list[str], timeout: int=None, message_tag: Optional[str]=None):
        await self.start()

        print("RUN COMMAND:", command)

        if timeout is not None:
            command = ["timeout", str(timeout), *command]

        resp = await self.container.exec(command,
            stdout=True, stderr=True, workdir='/workspace', user="sci-agent")
        stream = resp.start(detach=False, timeout=timeout)

        timestamp_start = int(time.time())
        await broker.publish(self.agent_session.id, {"type": "execution_start", "command": command, "tag": message_tag, "start_time": timestamp_start})

        output = ''
        try:
            while True:
                chunk = await stream.read_out()
                if not chunk:
                    break
                text = chunk[1].decode('utf-8')
                print(text, end='')
                output += text
                await broker.publish(self.agent_session.id, {"type": "execution_chunk", "output": text, "tag": message_tag})
            exit_code = (await resp.inspect())['ExitCode']
            print(f"Process exited with exit code {exit_code}")
        except asyncio.CancelledError:
            await self.stop()
            exit_code = 1
            raise
        finally:
            timestamp_end = int(time.time())
            await self.agent_session.add_execution_log({
                'start_time': timestamp_start,
                'end_time': timestamp_end,
                'command': command,
                'output': output,
                'exit_code': exit_code,
                'tag': message_tag,
            })

            await broker.publish(self.agent_session.id, {"type": "execution_end", "exit_code": exit_code, "tag": message_tag, "end_time": timestamp_end})

            await stream.close()

        if timeout and exit_code == 124:
            raise TimeoutError()

        return output, exit_code
    