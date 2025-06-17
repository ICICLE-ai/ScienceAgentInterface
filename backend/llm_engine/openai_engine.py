from openai import AsyncOpenAI, APIConnectionError, APITimeoutError, RateLimitError, InternalServerError

import backoff

@backoff.on_exception(backoff.expo, (APIConnectionError, APITimeoutError, RateLimitError, InternalServerError))
async def openai_chat_engine(client, engine, msg, temperature, top_p, stream=False):
    if engine.startswith("gpt"):
        response = await client.chat.completions.create(
            model=engine,
            messages=msg,
            temperature=temperature,
            max_tokens=2000,
            top_p=top_p,
            frequency_penalty=0,
            presence_penalty=0,
            stream=stream,
            stream_options={"include_usage": True},
        )
    else:
        response = await client.chat.completions.create(
            model=engine,
            messages=msg,
            temperature=temperature,
            max_tokens=2000,
            top_p=top_p,
            stream=stream,
            stream_options={"include_usage": True},
        )

    return response

class OpenaiEngine():

    def __init__(self, llm_engine_name, api_key, base_url=None):
        self.client = AsyncOpenAI(
            api_key=api_key,
            max_retries=10,
            timeout=120.0,
            base_url=base_url,
        )
        self.llm_engine_name = llm_engine_name

    async def respond_stream(self, user_input, temperature, top_p):
        response = await openai_chat_engine(
            self.client, 
            self.llm_engine_name, 
            user_input,
            temperature,
            top_p,
            stream=True
        )

        prompt_tokens = 0
        completion_tokens = 0
        async for chunk in response:
            content = None

            if chunk.usage:
                prompt_tokens = chunk.usage.prompt_tokens
                completion_tokens = chunk.usage.completion_tokens

            if chunk.choices and len(chunk.choices) > 0:
                content = chunk.choices[0].delta.content

            yield content, 0, 0

        yield None, prompt_tokens, completion_tokens

    async def respond(self, user_input, temperature, top_p):
        response = await openai_chat_engine(
            self.client, 
            self.llm_engine_name, 
            user_input,
            temperature,
            top_p,
            stream=False
        )

        content = response.choices[0].content
        prompt_tokens = response.usage.prompt_tokens
        completion_tokens = response.usage.completion_tokens

        return content, prompt_tokens, completion_tokens
 