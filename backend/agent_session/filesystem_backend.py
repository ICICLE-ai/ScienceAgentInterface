from .base_backend import blank_session, AgentSessionBase
import json
import aiofiles
import aiofiles.os
import os

class FilesystemAgentSession(AgentSessionBase):
    async def save(self, data):
        file_path = f"./agent_sessions/{self.id}/session.json"
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=4)

    @staticmethod
    async def create(prefill=None):
        data = blank_session(prefill)
        session = FilesystemAgentSession(data['id'])
        os.makedirs(f"./agent_sessions/{data['id']}", exist_ok=True)
        await session.save(data)
        return data['id']

    @staticmethod
    async def get_benchmark_tasks():
        tasks = []
        for folder in await aiofiles.os.listdir('./agent_sessions'):
            try:
                task = await FilesystemAgentSession(folder).get()
                if task['metadata']['source'] == 'benchmark':
                    tasks.append(task)
            except FileNotFoundError:
                continue
        return tasks

    @staticmethod
    async def get_user_tasks(user_id: str):
        tasks = []
        for folder in await aiofiles.os.listdir('./agent_sessions'):
            task = FilesystemAgentSession(folder).get()
            if task['metadata']['user_id'] == user_id:
                tasks.append(task)
        return tasks

    async def get(self):
        file_path = f"./agent_sessions/{self.id}/session.json"
        with open(file_path, 'r') as f:
            data = json.load(f)
        return data

    async def clear(self):
        data = await self.get()
        data['output_files'] = []
        data['code_files'] = [cf for cf in data.get('code_files', []) if cf.get('is_gold')]
        data['history'] = []
        data['total_prompt_tokens'] = 0
        data['total_completion_tokens'] = 0
        data['total_cost'] = 0
        data['execution_log'] = []
        await self.save(data)

    async def update_inputs(self, task_inst: str, domain_knowledge: str, description: str):
        data = await self.get()
        data['task_instruction'] = task_inst
        data['domain_knowledge'] = domain_knowledge
        data['description'] = description
        await self.save(data)

    async def get_output_files(self):
        data = await self.get()
        return data.get('output_files', [])

    async def add_output_files(self, outputs: list):
        data = await self.get()
        data['output_files'].extend(outputs)
        await self.save(data)

    async def get_uploaded_files(self):
        data = await self.get()
        return data.get('uploaded_files', [])

    async def get_code_files(self):
        data = await self.get()
        return data.get('code_files', [])

    async def update_code_file(self, code_file_id: str, user_content: str):
        data = await self.get()
        code_files = data.get('code_files', [])
        index = None
        for i, cf in enumerate(code_files):
            if cf['id'] == code_file_id:
                cf['user_content'] = user_content
                index = i
                break

        if index is None:
            return {"error": "Code file not found."}

        await self.save(data)

    async def add_code_file(self, code_data: dict):
        data = await self.get()
        code_files = data.get('code_files', [])
        code_files.append(code_data)
        data['code_files'] = code_files
        await self.save(data)

    async def get_history(self):
        data = await self.get()
        return data.get('history', [])

    async def add_history(self, history: list):
        data = await self.get()
        data['history'].extend(history)
        await self.save(data)

    async def add_usage(self, prompt_tokens: int, completion_tokens: int, cost: float):
        data = await self.get()
        data['total_prompt_tokens'] += prompt_tokens
        data['total_completion_tokens'] += completion_tokens
        data['total_cost'] += cost
        await self.save(data)

    async def add_execution_log(self, log: dict):
        data = await self.get()
        data['execution_log'].append(log)
        await self.save(data)

    async def add_uploaded_file(self, file_info: dict):
        data = await self.get()
        data['uploaded_files'].append(file_info)
        await self.save(data)

    async def remove_uploaded_file(self, filename):
        data = await self.get()
        uploaded_files = data.get('uploaded_files', [])

        file_to_delete = None
        file_index = None
        for i, file in enumerate(uploaded_files):
            if file['name'] == filename:
                file_to_delete = file
                file_index = i
                break

        if file_index is None:
            return {"error": "File not found."}

        data['uploaded_files'].pop(file_index)
        await self.save(data)

        return file_to_delete