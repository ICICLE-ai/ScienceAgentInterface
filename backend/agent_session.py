import os
import time
import uuid
import aiofiles.os
import aioboto3
from boto3.dynamodb.types import Decimal

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


class AWSAgentSession:
    @staticmethod
    async def create(prefill=None):
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
            del prefill['id']
            metadata = prefill.get('metadata', {})
            metadata.update(data['metadata'])
            data.update(prefill)
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            await table.put_item(Item=data)

        return data['id']

    @staticmethod
    async def get(agent_session_id: str):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            response = await table.get_item(Key={'id': agent_session_id})
            return replace_decimals(response.get('Item', {}))

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

    @staticmethod
    async def clear(agent_session_id: str):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            
            # Keep gold files
            response = await table.get_item(Key={'id': agent_session_id}, AttributesToGet=['code_files'])
            current_code_files = response.get('Item', {}).get('code_files', [])
            gold_code_files = [cf for cf in current_code_files if cf.get('is_gold')]
            
            await table.update_item(
                Key={'id': agent_session_id},
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

    @staticmethod
    async def update_inputs(agent_session_id: str, task_inst: str, domain_knowledge: str, description: str):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            await table.update_item(
                Key={'id': agent_session_id},
                UpdateExpression="SET description = :description, task_instruction = :task_instruction, domain_knowledge = :domain_knowledge",
                ExpressionAttributeValues={':description': description, ':task_instruction': task_inst, ':domain_knowledge': domain_knowledge },
            )

    @staticmethod
    async def add_output_files(agent_session_id: str, outputs: list, base_dir: str):
        async with boto3_session.resource('dynamodb') as db, boto3_session.client('s3') as s3:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            response = await table.get_item(Key={'id': agent_session_id}, AttributesToGet=['output_files'])
            existing_output_files = response.get('Item', {}).get('output_files', [])
            for output in outputs:
                is_duplicate = False
                for of in existing_output_files:
                    if of['hash'] == output['hash'] and of['filename'] == output['filename']:
                        is_duplicate = True
                        break
                
                if not is_duplicate:
                    await table.update_item(
                        Key={'id': agent_session_id},
                        UpdateExpression="SET output_files = list_append(output_files, :output)",
                        ExpressionAttributeValues={':output': [output]},
                    )
                    existing_output_files.append(output)

                    await s3.upload_file(os.path.join(base_dir, output['filename']), config.S3_BUCKET, output['object_name'])

        return replace_decimals(existing_output_files)

    @staticmethod
    async def download_missing_uploaded_files(agent_session_id: str, dir: str):
        async with boto3_session.resource('dynamodb') as db, boto3_session.client('s3') as s3:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            response = await table.get_item(Key={'id': agent_session_id}, AttributesToGet=['uploaded_files'])
            uploaded_files = response.get('Item', {}).get('uploaded_files', [])
        for file in uploaded_files:
            fname = f"{dir}/{file['name']}"
            if not await aiofiles.os.path.exists(fname):
                await aiofiles.os.makedirs(os.path.dirname(fname), exist_ok=True)
                await s3.download_file(config.S3_BUCKET, file['object_name'], fname)

    @staticmethod
    async def get_code_files(agent_session_id: str):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            response = await table.get_item(Key={'id': agent_session_id}, AttributesToGet=['code_files'])
            return replace_decimals(response.get('Item', {}).get('code_files', []))

    @staticmethod
    async def update_code_file(agent_session_id: str, id: str, user_content: str):
        code_files = await AWSAgentSession.get_code_files(agent_session_id)
        index = None
        for i, cf in enumerate(code_files):
            if cf['id'] == id:
                index = i
                break

        if index is None:
            return {"error": "Code file not found."}
        
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            await table.update_item(
                Key={'id': agent_session_id},
                UpdateExpression=f"SET code_files[{index}].user_content = :user_content",
                ExpressionAttributeValues={':user_content': user_content},
            )

    @staticmethod
    async def add_code_file(agent_session_id: str, code_data: dict):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            await table.update_item(
                Key={'id': agent_session_id},
                UpdateExpression="SET code_files = list_append(code_files, :code_files)",
                ExpressionAttributeValues={':code_files': [code_data]},
            )

    @staticmethod
    async def get_history(agent_session_id: str):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            response = await table.get_item(Key={'id': agent_session_id}, AttributesToGet=['history'])
            return response.get('Item', {}).get('history', [])

    @staticmethod
    async def add_history(agent_session_id: str, history: list):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            await table.update_item(
                Key={'id': agent_session_id},
                UpdateExpression="SET history = list_append(history, :history)",
                ExpressionAttributeValues={':history': history},
            )

    @staticmethod
    async def add_usage(agent_session_id: str, prompt_tokens: int, completion_tokens: int, cost: float):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            await table.update_item(
                Key={'id': agent_session_id},
                UpdateExpression="ADD total_prompt_tokens :prompt_tokens, total_completion_tokens :completion_tokens, total_cost :cost",
                ExpressionAttributeValues={':prompt_tokens': prompt_tokens, ':completion_tokens': completion_tokens, ':cost': Decimal(str(cost))},
            )

    @staticmethod
    async def add_execution_log(agent_session_id: str, log: dict):
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            await table.update_item(
                Key={'id': agent_session_id},
                UpdateExpression="SET execution_log = list_append(execution_log, :log)",
                ExpressionAttributeValues={':log': [log]},
            )

    @staticmethod
    async def upload_file(agent_session_id, file, content_length):
        object_name = f"{agent_session_id}/{file.filename}"
        
        async with boto3_session.client('s3') as s3:
            await s3.upload_fileobj(file.stream, config.S3_BUCKET, object_name)
        
        file_size = content_length or 0
        uploaded_file = {'name': file.filename, 'size': file_size, 'object_name': object_name, 'source': 'user'}
        
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            await table.update_item(
                Key={'id': agent_session_id},
                UpdateExpression="SET uploaded_files = list_append(uploaded_files, :file)",
                ExpressionAttributeValues={':file': [uploaded_file]},
            )

        return replace_decimals(uploaded_file)

    @staticmethod
    async def remove_uploaded_file(agent_session_id, filename):
        file_to_delete = None
        async with boto3_session.resource('dynamodb') as db:
            table = await db.Table(config.AGENT_SESSION_TABLE_NAME)
            response = await table.get_item(Key={'id': agent_session_id}, AttributesToGet=['uploaded_files'])
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
                Key={'id': agent_session_id},
                UpdateExpression=f"REMOVE uploaded_files[{file_index}]",
            )

        # Only delete user-uploaded files, not preloaded dataset files
        if file_to_delete and file_to_delete.get('source') == 'user':
            async with boto3_session.client('s3') as s3:
                await s3.delete_object(Bucket=config.S3_BUCKET, Key=f"{agent_session_id}/{filename}")

            
AgentSession = AWSAgentSession