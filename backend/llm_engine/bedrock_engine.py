from botocore.exceptions import ClientError
from botocore.client import Config
import aioboto3
import config

boto3_session = aioboto3.Session(region_name=config.AWS_BEDROCK_REGION)

class BedrockEngine():
    def __init__(self, llm_engine_name):
        self.config = Config(retries={"total_max_attempts": 10})
        self.llm_engine_name = llm_engine_name

    async def respond_stream(self, user_input, temperature, top_p):
        conversation = [
            {"role": turn["role"], "content": [{"text": turn["content"]}]}
            for turn in user_input
        ]

        async with boto3_session.client("bedrock-runtime", config=self.config) as client:
            response = await client.converse_stream(
                modelId=self.llm_engine_name,
                messages=conversation,
                inferenceConfig={"maxTokens": 2000, "temperature": temperature, "topP": top_p},
            )
            stream = response.get("stream")
            async for event in stream:
                content = None
                input_tokens = 0
                output_tokens = 0
                if 'messageStart' in event:
                    role = event['messageStart']['role']
                if 'contentBlockDelta' in event:
                    content = event['contentBlockDelta']['delta']['text']
                if 'messageStop' in event:
                    stop_reason = event['messageStop']['stopReason']
                    print(f"LLM stopped generating with stop reason: {stop_reason}")
                if 'metadata' in event:
                    metadata = event['metadata']
                    if 'usage' in metadata:
                        input_tokens = metadata['usage']['inputTokens']
                        output_tokens = metadata['usage']['outputTokens']

                yield content, input_tokens, output_tokens

    async def respond(self, user_input, temperature, top_p):
        conversation = [
            {"role": turn["role"], "content": [{"text": turn["content"]}]}
            for turn in user_input
        ]

        async with boto3_session.client("bedrock-runtime", config=self.config) as client:
            response = await client.converse(
                modelId=self.llm_engine_name,
                messages=conversation,
                inferenceConfig={"maxTokens": 2000, "temperature": temperature, "topP": top_p},
            )
            return response["output"]["message"]["content"][0]["text"], response["usage"]["inputTokens"], response["usage"]["outputTokens"]
