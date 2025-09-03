export interface HistoryItem {
  id: string;
  role: string;
  content: string;
  tag: string;
}

export interface CodeFile {
  id: string;
  filename: string;
  content: string; // original generated code
  user_content: string; // user-modified code
  history_id: string; // the history item that generated this code
  block_index: number;
  is_gold: boolean;
}

export interface UploadedFile {
  name: string;
  size: number;
  object_name: string; // S3 object name
  source: string;
}

export interface OutputFile {
  id: string;
  hash: string;
  filename: string;
  size: number;
  mimetype: string;
  code_data_id: string; // reference to code that generated this output
  object_name: string; // S3 object name
}

export interface ExecutionLogEntry {
  start_time: number;
  end_time: number;
  command: string[];
  output: string;
  exit_code: number;
  tag: string;
}

// NOTE: ScienceAgentBench dataset schema
export interface Task {
  instance_id?: string
  task_inst?: string
  domain?: string
  domain_knowledge?: string
  github_name?: string
  src_file_path?: string
  output_filename?: string
  dataset_preview?: string
  dataset_folder_tree?: string
}

// NOTE: same fields as AgentSession in agent_session.py in backend
export interface AgentSession {
  id: string;
  metadata: {
    created_at: number,
    user_id: string, // blank for benchmark tasks
    source: "benchmark" | "user",
  } & Task,
  description: string;
  task_instruction: string;
  domain_knowledge: string;
  history: HistoryItem[];
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_cost: number;
  execution_log: ExecutionLogEntry[];
  code_files: CodeFile[];
  uploaded_files: UploadedFile[];
  output_files: OutputFile[];

  error?: string;
}

type AgentMessageCallback = (data: AgentMessage|null, err: any) => void;

export type AgentMessageInitialState = {
  type: "state";
  state: AgentSession;
  has_default_llm: boolean;
}

export type AgentMessageResponseStart = {
  type: "response_start";
  id: string;
  role: string;
  tag: string;
}

export type AgentMessageResponseChunk = {
  type: "response_chunk";
  id: string;
  text: string;
}

export type AgentMessageResponseEnd = {
  type: "response_end";
  id: string;
}

export type AgentMessageUsage = {
  type: "usage";
  prompt_tokens: number;
  completion_tokens: number;
  cost: number;
}

export type AgentMessageCodeFile = {
  type: "code_file";
  code_file: CodeFile;
}

export type AgentMessageExecutionStart = {
  type: "execution_start";
  command: string[];
  tag: string;
  start_time: number;
}

export type AgentMessageExecutionChunk = {
  type: "execution_chunk";
  output: string;
}

export type AgentMessageExecutionEnd = {
  type: "execution_end";
  exit_code: number;
  end_time: number;
}

export type AgentMessageOutputFiles = {
  type: "output_files";
  files: OutputFile[];
}

export type AgentMessage =
  | AgentMessageInitialState
  | AgentMessageResponseStart
  | AgentMessageResponseChunk
  | AgentMessageResponseEnd
  | AgentMessageUsage
  | AgentMessageCodeFile
  | AgentMessageOutputFiles
  | AgentMessageExecutionStart
  | AgentMessageExecutionChunk
  | AgentMessageExecutionEnd;


const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const WS_BASE_URL = BASE_URL.replace(/^https/, "wss").replace(/^http/, "ws");
const STATIC_FILE_BASE_URL = import.meta.env.VITE_STATIC_FILE_BASE_URL || "storage";

export const outputFileUrl = (file: OutputFile) => {
  return `${STATIC_FILE_BASE_URL}/${file.object_name}`;
};

export const createAgentSession = async () => {
  const response = await fetch(`${BASE_URL}/api/execution/agent_session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return response.json();
};

export const validateAgentSession = async (agent_session_id: string) => {
  const response = await fetch(`${BASE_URL}/api/execution/agent_session/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent_session_id}),
  });
  return response.json();
};

export const createAgentSessionFromTask = async (taskId: string) => {
  const response = await fetch(`${BASE_URL}/api/tasks/${taskId}/agent_session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return response.json();
};

export const fetchTasks = async (): Promise<AgentSession[]> => {
  const response = await fetch(`${BASE_URL}/api/tasks/`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  return response.json()
};

export const fetchUserTasks = async (): Promise<AgentSession[]> => {
  const response = await fetch(`${BASE_URL}/api/user_tasks`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  return response.json();
};

export const fetchTask = async (instanceId: string | number): Promise<AgentSession> => {
  const response = await fetch(`${BASE_URL}/api/tasks/${instanceId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  return response.json();
};

export const createTask = async (data: any) => {
  const response = await fetch(`${BASE_URL}/api/tasks/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return response.json();
};

export const createUserTask = async (data: any) => {
  const response = await fetch(`${BASE_URL}/api/userTasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return response.json();
};

export const evaluateTask = async (data: any) => {
  const response = await fetch(`${BASE_URL}/api/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return response.json();
};

export class AgentWebSocketConnection {
  ws?: WebSocket;
  onMessage: AgentMessageCallback;
  onConnectionChange?: (connected: boolean) => void;
  agentSessionId: string;
  reconnectAttempts = 0;
  reconnectTimeout: NodeJS.Timeout | null = null;
  maxReconnectAttempts = 10;
  isClosedByUser = false;
  commandCounter = 0;
  pendingCommands: Map<number, { resolve: (value: any) => void, reject: (reason?: any) => void }> = new Map();

  constructor(agentSessionId: string, onMessage: AgentMessageCallback, onConnectionChange?: (connected: boolean) => void) {
    this.agentSessionId = agentSessionId;
    this.onMessage = onMessage;
    this.onConnectionChange = onConnectionChange;
    this.connect();
  }

  async runCommand(command: string, args?: { [key: string]: any }, timeout: number=15*1000) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    this.commandCounter++;
    const commandId = this.commandCounter
    const message = {
      command,
      command_id: commandId,
      ...args,
    };
    this.ws!.send(JSON.stringify(message));

    // Create a promise that will resolve when we get a response with this command_id
    const promise = new Promise((resolve, reject) => {
      this.pendingCommands.set(commandId, { resolve, reject });
      
      // console.log(`Command sent: ${command} (ID: ${commandId}) with timeout ${timeout}ms`);
      if (timeout > 0) {
        setTimeout(() => {
          if (this.pendingCommands.has(commandId)) {
            this.pendingCommands.delete(commandId);
            reject(new Error(`Command timed out: ${command}`));
          }
        }, timeout);
      }
    });
    
    return promise;
  }

  connect() {
    this.ws = new WebSocket(`${WS_BASE_URL}/api/execution/ws/${this.agentSessionId}`);
    
    this.ws.addEventListener('open', () => {
      console.log('Science Agent WebSocket connected');
      this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
      this.onConnectionChange?.(true);
    });
    
    this.ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);

      // Check if this is a response to a pending command
      if (data.command_id && this.pendingCommands.has(data.command_id)) {
        const { resolve, reject } = this.pendingCommands.get(data.command_id)!;
        this.pendingCommands.delete(data.command_id);
        if (data.type === 'error') {
          reject(new Error(data.message));
        } else {
          resolve(data);
        }
      } else {
        if (data.type === 'error') {
          this.onMessage(null, data.message);
        } else {
          this.onMessage(data, null);
        }
      }
    });
    
    this.ws.addEventListener('close', (_event) => {
      console.log('Science Agent WebSocket disconnected');
      for (const { reject } of this.pendingCommands.values()) {
        reject(new Error('WebSocket disconnected'));
      }
      if (!this.isClosedByUser) {
        this.onConnectionChange?.(false);
        this.attemptReconnect();
      }
    });
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      console.log("Attempting to reconnect WebSocket...")

      // Exponential backoff: 2^attempts * 1000ms (1s, 2s, 4s, 8s, etc.)
      const delay = Math.min(30000, Math.pow(2, this.reconnectAttempts) * 1000);
      
      console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
      
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectAttempts++;
        this.connect();
      }, delay);
    } else {
      console.log('Maximum reconnection attempts reached. Giving up.');
      this.onMessage(null, 'Connection lost. Maximum reconnection attempts reached.');
    }
  }

  close() {
    this.isClosedByUser = true;
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    this.ws?.close();
    this.ws = undefined;
  }
}

export const uploadFile = async (
  file: File, 
  agentSessionId: string, 
  onProgress: (progress: number) => void
): Promise<{ success: boolean; error?: string; fileId?: string }> => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    return new Promise((resolve, _reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.open('POST', `${BASE_URL}/api/execution/upload/${agentSessionId}`);
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      });
      
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const response = JSON.parse(xhr.responseText);
          resolve({ success: true, fileId: response.fileId });
        } else {
          resolve({ success: false, error: `Upload failed: ${xhr.statusText}` });
        }
      };
      
      xhr.onerror = () => {
        resolve({ success: false, error: 'Network error during upload' });
      };
      
      xhr.send(formData);
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

export const deleteFile = async (
  filename: string,
  agentSessionId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const response = await fetch(
      `${BASE_URL}/api/execution/upload/${agentSessionId}/${filename}`,
      { method: 'DELETE' },
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      return { success: false, error: errorData.message || 'Failed to delete file' };
    }
    
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error during file deletion' 
    };
  }
};
