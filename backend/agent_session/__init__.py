import config

if config.AGENT_SESSION_BACKEND == "dynamodb":
    from .dynamodb_backend import AWSAgentSession as AgentSession
elif config.AGENT_SESSION_BACKEND == "filesystem":
    from .filesystem_backend import FilesystemAgentSession as AgentSession
else:
    raise ValueError(f"Unsupported AGENT_SESSION_BACKEND: {config.AGENT_SESSION_BACKEND}")