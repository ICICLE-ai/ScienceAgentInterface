class LLMEngine():
    def __init__(self, llm_engine_name, api_key):
        self.llm_engine_name = llm_engine_name
        self.engine = None
        if any(llm_engine_name.startswith(prefix) for prefix in ["gpt", "o1", "o3", "o4"]):
            from llm_engine.openai_engine import OpenaiEngine
            self.engine = OpenaiEngine(llm_engine_name, api_key)
        elif any(llm_engine_name.startswith(prefix) for prefix in ["gemini", "gemma"]):
            from llm_engine.openai_engine import OpenaiEngine
            self.engine = OpenaiEngine(llm_engine_name, api_key, base_url="https://generativelanguage.googleapis.com/v1beta/openai/")
        else:
            from llm_engine.bedrock_engine import BedrockEngine
            self.engine = BedrockEngine(llm_engine_name)

    def respond(self, user_input, temperature, top_p):
        return self.engine.respond(user_input, temperature, top_p)

    def respond_stream(self, user_input, temperature, top_p):
        return self.engine.respond_stream(user_input, temperature, top_p)