import uuid
import time

def blank_session(prefill=None):
    data = {
        'id': str(uuid.uuid4()),
        'metadata': {
            'created_at': int(time.time()),
            'source': 'user',
            'user_id': '',
        },
        'description': '',
        'task_instruction': '',
        'domain_knowledge': '',
        'uploaded_files': [],
        'output_files': [],
        'code_files': [],
        'history': [],
        'total_prompt_tokens': 0,
        'total_completion_tokens': 0,
        'total_cost': 0,
        'execution_log': [],
    }
    if prefill:
        if 'id' in prefill:
            del prefill['id']
        data['metadata'].update(prefill.get('metadata', {}))
        prefill.pop('metadata', None)
        data.update(prefill)
    return data


class AgentSessionBase:
    def __init__(self, id: str):
        self.id = id
