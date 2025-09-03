import aioboto3
from boto3.dynamodb.types import Decimal
from .base_backend import blank_session, AgentSessionBase
import config


boto3_session = aioboto3.Session(region_name=config.AWS_REGION)


def replace_decimals(obj):
    if isinstance(obj, list):
        for i in range(len(obj)):
            obj[i] = replace_decimals(obj[i])
        return obj
    elif isinstance(obj, dict):
        for k in obj:
            obj[k] = replace_decimals(obj[k])
        return obj
    elif isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        else:
            return float(obj)
    else:
        return obj


class AWSAgentSession(AgentSessionBase):
    @staticmethod
    async def create(prefill=None):
        data = blank_session(prefill)
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            await table.put_item(Item=data)

        return data['id']

    @staticmethod
    async def get_benchmark_tasks():
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            
            all_items = []
            last_evaluated_key = None
            
            # Continue scanning until all results are retrieved
            while True:
                scan_params = {
                    'FilterExpression': "metadata.#src = :source",
                    'ExpressionAttributeNames': {"#src": "source"},
                    'ExpressionAttributeValues': {':source': 'benchmark'}
                }
                
                # Add ExclusiveStartKey for pagination if this isn't the first request
                if last_evaluated_key:
                    scan_params['ExclusiveStartKey'] = last_evaluated_key
                
                response = await table.scan(**scan_params)
                all_items.extend(response.get('Items', []))
                last_evaluated_key = response.get('LastEvaluatedKey')
                if not last_evaluated_key:
                    break
            
            return replace_decimals(all_items)

    @staticmethod
    async def get_user_tasks(user_id: str):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            response = await table.scan(FilterExpression="metadata.user_id = :user_id", ExpressionAttributeValues={':user_id': user_id})
            return replace_decimals(response.get('Items', []))

    async def get(self):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            response = await table.get_item(Key={'id': self.id})
            return replace_decimals(response.get('Item', {}))

    async def clear(self):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            
            # Keep gold files
            response = await table.get_item(Key={'id': self.id}, AttributesToGet=['code_files'])
            current_code_files = response.get('Item', {}).get('code_files', [])
            gold_code_files = [cf for cf in current_code_files if cf.get('is_gold')]
            
            await table.update_item(
                Key={'id': self.id},
                UpdateExpression="SET output_files = :output_files, code_files = :code_files, history = :history, total_prompt_tokens = :total_prompt_tokens, total_completion_tokens = :total_completion_tokens, total_cost = :total_cost, execution_log = :execution_log",
                ExpressionAttributeValues={
                    ':output_files': [],
                    ':code_files': gold_code_files,
                    ':history': [],
                    ':total_prompt_tokens': 0,
                    ':total_completion_tokens': 0,
                    ':total_cost': 0,
                    ':execution_log': [],
                },
            )

    async def update_inputs(self, task_inst: str, domain_knowledge: str, description: str):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            await table.update_item(
                Key={'id': self.id},
                UpdateExpression="SET description = :description, task_instruction = :task_instruction, domain_knowledge = :domain_knowledge",
                ExpressionAttributeValues={':description': description, ':task_instruction': task_inst, ':domain_knowledge': domain_knowledge },
            )

    async def get_output_files(self):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            response = await table.get_item(Key={'id': self.id}, AttributesToGet=['output_files'])
            return replace_decimals(response.get('Item', {}).get('output_files', []))

    async def add_output_files(self, outputs: list):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            await table.update_item(
                Key={'id': self.id},
                UpdateExpression="SET output_files = list_append(output_files, :output)",
                ExpressionAttributeValues={':output': outputs},
            )

    async def get_uploaded_files(self):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            response = await table.get_item(Key={'id': self.id}, AttributesToGet=['uploaded_files'])
            return replace_decimals(response.get('Item', {}).get('uploaded_files', []))

    async def get_code_files(self):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            response = await table.get_item(Key={'id': self.id}, AttributesToGet=['code_files'])
            return replace_decimals(response.get('Item', {}).get('code_files', []))

    async def update_code_file(self, code_file_id: str, user_content: str):
        code_files = await self.get_code_files()
        index = None
        for i, cf in enumerate(code_files):
            if cf['id'] == code_file_id:
                index = i
                break

        if index is None:
            return {"error": "Code file not found."}
        
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            await table.update_item(
                Key={'id': self.id},
                UpdateExpression=f"SET code_files[{index}].user_content = :user_content",
                ExpressionAttributeValues={':user_content': user_content},
            )

    async def add_code_file(self, code_data: dict):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            await table.update_item(
                Key={'id': self.id},
                UpdateExpression="SET code_files = list_append(code_files, :code_files)",
                ExpressionAttributeValues={':code_files': [code_data]},
            )

    async def get_history(self):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            response = await table.get_item(Key={'id': self.id}, AttributesToGet=['history'])
            return response.get('Item', {}).get('history', [])

    async def add_history(self, history: list):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            await table.update_item(
                Key={'id': self.id},
                UpdateExpression="SET history = list_append(history, :history)",
                ExpressionAttributeValues={':history': history},
            )

    async def add_usage(self, prompt_tokens: int, completion_tokens: int, cost: float):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            await table.update_item(
                Key={'id': self.id},
                UpdateExpression="ADD total_prompt_tokens :prompt_tokens, total_completion_tokens :completion_tokens, total_cost :cost",
                ExpressionAttributeValues={':prompt_tokens': prompt_tokens, ':completion_tokens': completion_tokens, ':cost': Decimal(str(cost))},
            )

    async def add_execution_log(self, log: dict):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            await table.update_item(
                Key={'id': self.id},
                UpdateExpression="SET execution_log = list_append(execution_log, :log)",
                ExpressionAttributeValues={':log': [log]},
            )

    async def add_uploaded_file(self, file_info: dict):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            await table.update_item(
                Key={'id': self.id},
                UpdateExpression="SET uploaded_files = list_append(uploaded_files, :file)",
                ExpressionAttributeValues={':file': [file_info]},
            )

    async def remove_uploaded_file(self, filename):
        file_to_delete = None
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            response = await table.get_item(Key={'id': self.id}, AttributesToGet=['uploaded_files'])
            uploaded_files = response.get('Item', {}).get('uploaded_files', [])
            file_index = None
            for i, file in enumerate(uploaded_files):
                if file['name'] == filename:
                    file_to_delete = file
                    file_index = i
                    break

            if file_index is None:
                return {"error": "File not found."}

            await table.update_item(
                Key={'id': self.id},
                UpdateExpression=f"REMOVE uploaded_files[{file_index}]",
            )

        return replace_decimals(file_to_delete)