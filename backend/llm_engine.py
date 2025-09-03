from litellm import cost_per_token, acompletion
from litellm.utils import trim_messages
import config


class LLMEngine():
    def __init__(self, llm_engine_name, api_key=None, base_url=None):
        self.llm_engine_name = llm_engine_name
        self.api_key = api_key
        self.base_url = base_url or config.LLM_BASE_URL

    def get_cost(self, prompt_tokens, completion_tokens):
        prompt_cost, completion_cost = cost_per_token(
            model=self.llm_engine_name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )
        cost = prompt_cost + completion_cost
        return cost

    async def respond_stream(self, user_input, temperature, top_p):
        response = await acompletion(
            model=self.llm_engine_name,
            messages=user_input,
            temperature=temperature,
            top_p=top_p,
            stream=True,
            stream_options={"include_usage": True},
            api_key=self.api_key,
            api_base=self.base_url,
            region_name=config.LLM_REGION_NAME,
        )

        async for chunk in response:
            if hasattr(chunk, 'usage'):
                prompt_tokens = chunk.usage.prompt_tokens
                completion_tokens = chunk.usage.completion_tokens
                yield None, prompt_tokens, completion_tokens
            elif chunk.choices and len(chunk.choices) > 0:
                content = chunk.choices[0].delta.content
                yield content, 0, 0
        
    
    async def respond(self, user_input, temperature, top_p):
        response = await acompletion(
            model=self.llm_engine_name,
            messages=user_input,
            temperature=temperature,
            top_p=top_p,
            stream=False,
            stream_options={"include_usage": True},
            api_key=self.api_key,
            api_base=self.base_url,
            region_name=config.LLM_REGION_NAME,
        )

        content = response
        input_tokens = response.usage.prompt_tokens
        output_tokens = response.usage.completion_tokens
        return content, input_tokens, output_tokens

    def trim_messages(self, messages, max_tokens):
        return trim_messages(messages, self.llm_engine_name, max_tokens)
