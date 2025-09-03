# Store any configuration settings like database URLs, secret keys, and environment-specific variables here

STORAGE_BACKEND = 'filesystem'  # Options: 's3', 'filesystem'
STORAGE_DIR = 'file_storage' # for 'filesystem' storage
S3_BUCKET = 'science-agent-interface' # for 's3' storage

AGENT_SESSION_BACKEND = 'filesystem'  # Options: 'dynamodb', 'filesystem'
AGENT_SESSION_TABLE_NAME = 'science-agent-interface-sessions'
AWS_REGION = 'us-east-2'

LLM_REGION_NAME = 'us-west-2' # Region for LMM provider (e.g. AWS Bedrock)
LLM_ENGINE_NAME = 'bedrock/anthropic.claude-3-5-haiku-20241022-v1:0' # any litellm compatible model name
LLM_BASE_URL = None  # Derived from LLM_ENGINE_NAME if not provided