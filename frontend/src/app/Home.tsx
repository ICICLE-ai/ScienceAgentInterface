"use client"

import React from "react"
import { useState, useEffect, useRef } from "react"
import {
  FileCode,
  ArrowBigRight,
  Files,
  ChevronDown,
  SidebarClose,
  SidebarOpen,
  Settings,
  Zap,
  MessageSquare,
  Square,
  Send,
  Info,
  FileText,
  BarChart,
  HelpCircle,
  AlertCircle,
  ArrowDown,
  Edit,
  ChevronUp,
  House,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { useDebouncedCallback } from "use-debounce"
import { Link } from "react-router-dom"
import { useTheme } from "@/providers/ThemeProvider"
import { ThemeToggle } from "@/components/ThemeToggleButton"
import {
  createAgentSession,
  validateAgentSession,
  AgentWebSocketConnection,
  uploadFile,
  deleteFile,
  type ExecutionLogEntry,
  type CodeFile,
  type OutputFile,
  type AgentSession,
  type AgentMessage,
} from "../api/api"
import { ThemeDropdown } from "@/components/ThemeDropdown"
import { Label } from "@/components/ui/label"
import { formatFileSize, scrollIntoView } from "@/lib/utils"
import { FileUploader, type UploadedFile } from "@/components/ui/file-uploader"
import MarkdownRenderer from "@/components/MarkdownRenderer"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { ResultsPanel } from "../components/panels/ResultsPanel"
import HelpModal from "../components/HelpModal"
import WorkflowStepsIndicator from "../components/WorkflowStepsIndicator"
import { CodeBlockRenderer } from "@/components/CodeBlockRenderer"
import { LocalStorageInput } from "@/components/ui/local-storage-input"
import { CodeEditorPanel } from "@/components/panels/CodeEditorPanel"
import { ResizablePanels } from "../components/ResizablePanels"
import { DatabaseIcon, ListIcon, GridIcon } from "@/components/Icons"

type PanelType = "reasoning" | "program" | "results"

interface ReasoningItemBlock {
  type: "code" | "text"
  content: string
  name?: string
  completed: boolean
}

interface ReasoningItem {
  role: string
  items: ReasoningItemBlock[]
  tag: string
  id: string
}

const Execution = () => {
  const [useResizableTabs, setUseResizableTabs] = useState<boolean>(true)
  const [mainTab, setMainTab] = useState<PanelType>("reasoning")
  const [activePanel, setActivePanel] = useState<PanelType>("reasoning")
  const [activatedPanels, setActivatedPanels] = useState<PanelType[]>(["reasoning"])
  const [sidebarTab, setSidebarTab] = useState<"input" | "settings">("settings")
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false)
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false)
  const [isDiffViewActive, setIsDiffViewActive] = useState<boolean>(false)
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [sidebarFilesDropdownOpen, setSidebarFilesDropdownOpen] = useState<boolean>(true)
  const [isInstructionEditable, setIsInstructionEditable] = useState<boolean>(true)
  const [currentStep, setCurrentStep] = useState<number>(1)
  const [userScrolledReasoning, setUserScrolledReasoning] = useState<boolean>(false)
  const [agentSession, setAgentSession] = useState<AgentSession>()
  const [domainKnowledge, setDomainKnowledge] = useState<string>("")
  const [description, setDescription] = useState<string>("")
  const [taskInst, setTaskInst] = useState<string>("")
  const [useSelfDebug, setUseSelfDebug] = useState<boolean>(true)
  const [error, setError] = useState<string>("")
  const [reasoningProcess, setReasoningProcess] = useState<ReasoningItem[]>([])
  const [codeFiles, setCodeFiles] = useState<CodeFile[]>([])
  const [selectedProgramIndex, setSelectedProgramIndex] = useState<number>(0)
  const [reasoningCounter, setReasoningCounter] = useState<number>(0)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [executionLog, setExecutionLog] = useState<ExecutionLogEntry[]>([])
  const [generationError, setGenerationError] = useState<string>("")
  const [outputFiles, setOutputFiles] = useState<OutputFile[]>([])
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [showLLMModal, setShowLLMModal] = useState<boolean>(false)

  const reasoningRef = useRef<HTMLDivElement>(null)

  // Load resizable tabs preference from localStorage
  useEffect(() => {
    const savedPreference = localStorage.getItem("useResizableTabs")
    if (savedPreference !== null) {
      setUseResizableTabs(savedPreference === "true")
    }
  }, [])

  useEffect(() => {
    if (isTransitioning) {
      const timer = setTimeout(() => setIsTransitioning(false), 100)
      return () => clearTimeout(timer)
    }
  }, [isTransitioning])

  let msg: any = null
  let lastExecLog: ExecutionLogEntry = {
    start_time: 0,
    end_time: 0,
    command: [],
    output: "",
    exit_code: 0,
    tag: "",
  }

  const handleAgentMessage = (data: AgentMessage | null, err: unknown) => {
    if (err) {
      console.error("Generation error:", err)
      setIsGenerating(false)
      setIsRunning(false)
      setGenerationError(err instanceof Error ? err.message : String(err))
      return
    }

    if (!data) { return }

    switch (data.type) {
      case "state":
        initState(data.state)
        if (!data.has_default_llm) {
          const saved = localStorage.getItem("llm_engine_name")
          if (!saved) {
            setShowLLMModal(true)
          }
        }
        break
      case "response_start":
        const newMsg = {
          role: data.role,
          items: [],
          tag: data.tag,
          id: data.id,
        }
        setReasoningProcess((prev) => [...prev, newMsg])
        setReasoningCounter((n) => n + 1)
        msg = newMsg
        break
      case "response_chunk":
        // Append the streaming text to the last item
        if (msg.items.length === 0) {
          msg.items.push({ content: "", type: "text" })
        }
        let last = msg.items[msg.items.length - 1]
        last.content += data.text

        while (true) {
          let hasSplit = false
          if (last.type === "text") {

            // this is safe because context only ever occurs in user messages which come in whole chunks
            while (last.content.includes("BEGIN_CONTEXT: ") && last.content.includes("END_CONTEXT")) {
              // delete everything between BEGIN_CONTEXT and END_CONTEXT
              const startIndex = last.content.indexOf("BEGIN_CONTEXT: ")
              const endIndex = last.content.indexOf("END_CONTEXT")
              const beforeContext = last.content.slice(0, startIndex)
              const afterContext = last.content.slice(endIndex + "END_CONTEXT".length)
              last.content = beforeContext + afterContext
            }

            if (last.content.includes("```python")) {
              const parts = last.content.split("```python")
              last.content = parts[0].trimEnd()

              // Everything after the first ```python
              const remainingText = parts.slice(1).join("```python").trimStart()
              const name = "Python"
              if (last.content.length === 0) {
                // Turn this item into code
                last.type = "code"
                last.content = ""
                last.name = name
              } else {
                // Or create a new code item
                msg.items.push({
                  content: remainingText,
                  type: "code",
                  name,
                })
              }
              hasSplit = true
            }
          }
          // If we are in code mode and see ```
          else if (last.type === "code") {
            if (last.content.includes("```")) {
              const parts = last.content.split("```")
              last.content = parts[0].trimEnd()
              last.completed = true

              const remainingText = parts.slice(1).join("```").trimStart()
              // The remainder becomes text again
              msg.items.push({ content: remainingText, type: "text" })
              hasSplit = true
            }
          }

          // If we splitted, we need to re-check
          last = msg.items[msg.items.length - 1]

          if (!hasSplit) break
        }
        setReasoningProcess((prev) => [...prev])
        setReasoningCounter((n) => n + 1)
        break
      case "response_end":
        // No need to handle
        break
      case "usage":
        // Update the usage stats
        break
      case "code_file":
        setCodeFiles((prev) => {
          const newCodeFiles = [...prev, data.code_file]
          setSelectedProgramIndex(newCodeFiles.length - 1)
          return newCodeFiles
        })
        break
      case "execution_start":
        lastExecLog = {
          start_time: data.start_time,
          end_time: 0,
          command: data.command,
          output: "",
          exit_code: -1,
          tag: data.tag,
        }
        setExecutionLog((prev) => [...prev, lastExecLog])
        break
      case "execution_chunk":
        lastExecLog.output += data.output
        setExecutionLog((prev) => [...prev])
        break
      case "execution_end":
        lastExecLog.exit_code = data.exit_code
        lastExecLog.end_time = data.end_time
        setExecutionLog((prev) => [...prev])
        break
      case "output_files":
        setOutputFiles(data.files)
        break
      default:
        console.warn("Unhandled message type", data)
    }
  }

  const initState = (state: AgentSession) => {
    setAgentSession(state)

    setTaskInst(state.task_instruction)
    setDomainKnowledge(state.domain_knowledge)
    setDescription(state.description)
    setUploadedFiles(
      state.uploaded_files.map((f) => ({
        name: f.name,
        size: f.size,
        progress: 100,
        status: "completed",
      })),
    )
    setCodeFiles(state.code_files)
    setSelectedProgramIndex(state.code_files.length - 1)
    setExecutionLog(state.execution_log)
    setOutputFiles(state.output_files)

    // Check if this is a fresh task (no history) and has task instructions
    // This would indicate it's likely a new task from the gallery
    if (state.history.length === 0 && state.task_instruction) {
      // This is a new task from the gallery, ensure inputs are expanded
      setIsInstructionEditable(true)

      // If sidebar is not open, open it for new tasks
      if (!isSidebarOpen) {
        setIsTransitioning(true)
        setIsSidebarOpen(false)
        setSidebarTab("input")
      }
    }
    else if (state.history.length > 0) {
      setIsInstructionEditable(false)
    }

    // replay the history
    reasoningProcess.length = 0
    setReasoningProcess([])
    state.history.forEach((item) => {
      handleAgentMessage({ type: "response_start", role: item.role, tag: item.tag, id: item.id }, null)
      handleAgentMessage({ type: "response_chunk", text: item.content, id: item.id }, null)
    })
  }

  const ws = useRef<AgentWebSocketConnection | null>(null)

  const safeRunCommand = async (command: string, data?: any, timeout = 0) => {
    if (!ws.current) {
      throw new Error("WebSocket connection not established")
    }

    try {
      return await ws.current.runCommand(command, data, timeout)
    } catch (err) {
      console.error(`Error running command ${command}:`, err)

      if (err instanceof Error && (err.message?.includes("EPIPE") || err.message?.includes("not open"))) {
        setIsConnected(false)
      }

      throw err
    }
  }

  // Initialize WebSocket connection and validate session
  useEffect(() => {
    const initializeSession = async () => {
      const savedAgentSessionId = localStorage.getItem("agentSessionId")
      try {
        const agentSessionId = savedAgentSessionId || (await createAgentSession()).agent_session_id

        if (!agentSessionId) {
          setError("Failed to start agent session: No session ID received.")
          return
        }

        localStorage.setItem("agentSessionId", agentSessionId)

        ws.current?.close()
        ws.current = new AgentWebSocketConnection(
          agentSessionId, handleAgentMessage, (connected) => setIsConnected(connected))

        if (savedAgentSessionId) {
          const res = await validateAgentSession(savedAgentSessionId)
          if (res.error) {
            localStorage.removeItem("agentSessionId")
            console.error("Error validating agent session:", res.error)
            setError(res.error)
            return
          }
        } else {
          const savedSessionIDs = JSON.parse(localStorage.getItem("savedSessionIDs") || "[]")
          if (!savedSessionIDs.includes(agentSessionId)) {
            localStorage.setItem("savedSessionIDs", JSON.stringify([...savedSessionIDs, agentSessionId]))
          }
        }
      } catch (err: unknown) {
        console.error("Error initializing agent session:", err)
        setError("Failed to communicate with server")
      }
    }

    initializeSession()

    return () => {
      if (ws.current) {
        try {
          ws.current.close()
        } catch (err) {
          console.error("Error closing WebSocket connection:", err)
        }
        ws.current = null
      }
    }
  }, [])

  useEffect(() => scrollIntoView(userScrolledReasoning, reasoningRef), [reasoningCounter])

  const { theme, savedTheme } = useTheme()

  const handleFilesAdded = async (newFiles: File[]) => {
    const filesToAdd = newFiles.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type,
      progress: 0,
      status: "uploading" as const,
    }))

    setUploadedFiles((prev) => [...prev, ...filesToAdd])

    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i]
      const filename = filesToAdd[i].name

      try {
        const result = await uploadFile(file, agentSession!.id, (progress) =>
          setUploadedFiles((current) => current.map((f) => (f.name === filename ? { ...f, progress } : f))),
        )

        if (result.success) {
          setUploadedFiles((current) =>
            current.map((f) => (f.name === filename ? { ...f, status: "completed" as const } : f)),
          )
        } else {
          setUploadedFiles((current) =>
            current.map((f) => (f.name === filename ? { ...f, status: "error" as const } : f)),
          )
          console.error(`File upload failed: ${result.error}`)
        }
      } catch (err) {
        setUploadedFiles((current) =>
          current.map((f) => (f.name === filename ? { ...f, status: "error" as const } : f)),
        )
        console.error(`Error uploading file:`, err)
      }
    }
  }

  const handleFileDelete = async (filename: string) => {
    const fileToDelete = uploadedFiles.find((f) => f.name === filename)

    if (!fileToDelete || !agentSession?.id) {
      return
    }

    try {
      const result = await deleteFile(filename, agentSession.id)

      if (result.success) {
        setUploadedFiles((current) => current.filter((f) => f.name !== filename))
      } else {
        console.error(`Failed to delete file: ${result.error}`)
      }
    } catch (err) {
      console.error(`Error deleting file:`, err)
    }
  }

  const toggleSidebar = () => {
    setIsTransitioning(true)
    setIsSidebarOpen(!isSidebarOpen)
  }

  const getLLMInfo = () => {
    return {
      llm_engine_name: localStorage.getItem("llm_engine_name"),
      llm_api_key: localStorage.getItem("llm_api_key"),
      llm_base_url: localStorage.getItem("llm_base_url"),
    }
  }

  const handleSolveTask = () => {
    if (!taskInst) {
      toast.error("Please provide a task instruction.")
      return
    }

    if (reasoningCounter > 0 && reasoningProcess.length > 0) {
      setCodeFiles(codeFiles => codeFiles.filter((f) => f.is_gold))
      setReasoningProcess([])
      setExecutionLog([])
      setOutputFiles([])
    }

    setIsGenerating(true)
    setIsInstructionEditable(false)
    setGenerationError("")
    setCurrentStep(2) // Move to step 2 (Processing)

    safeRunCommand("solve_task", { use_self_debug: useSelfDebug, ...getLLMInfo() }, 0)
      .then(() => {
        setCurrentStep(3) // Move to step 3 (Results)
      })
      .catch((err: unknown) => {
        setGenerationError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        setIsGenerating(false)
      })
  }

  const handleRunProgram = (codeFile: CodeFile) => {
    setIsRunning(true)
    ws.current
      ?.runCommand("run_program", { id: codeFile.id }, 0)
      .then(() => {
        // Command sent successfully
      })
      .catch((err: unknown) => {
        console.error("Error running program:", err)
        setGenerationError("Failed to run program: " + (err instanceof Error ? err.message : String(err)))
      })
      .finally(() => setIsRunning(false))

    // Only switch to results tab in standard mode
    if (!useResizableTabs) {
      setMainTab("results")
    }
  }

  const handleCancel = () => {
    safeRunCommand("cancel")
      .catch((err: unknown) => setGenerationError(err instanceof Error ? err.message : String(err)))
      .finally(() => {
        setIsGenerating(false)
        setIsRunning(false)
      })
  }

  const updateProgramContent = useDebouncedCallback((content: string, codeFile: CodeFile) => {
    ws.current?.runCommand("update_program", { id: codeFile.id, user_content: content })
  }, 500)

  const updateTaskInputs = useDebouncedCallback(() => {
    ws.current?.runCommand("update_task_inputs", {
      task_instruction: taskInst,
      domain_knowledge: domainKnowledge,
      description: description,
    })
  }, 500)

  const addUserMessage = async (
    e: React.KeyboardEvent<HTMLTextAreaElement> | { key: string; target: HTMLInputElement },
  ) => {
    if (isGenerating) {
      // Ignore request if a request is already running
      return
    }

    if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
      const message = (e.target as HTMLInputElement).value.trim()
        ; (e.target as HTMLInputElement).value = ""

      setIsGenerating(true)
      setGenerationError("")
      ws.current
        ?.runCommand("follow_up", {
          message: message,
          code_id: codeFiles[selectedProgramIndex].id,
          use_self_debug: useSelfDebug,
          ...getLLMInfo(),
        }, 0)
        .catch((err: unknown) => setGenerationError(err instanceof Error ? err.message : String(err)))
        .finally(() => setIsGenerating(false))
    }
  }

  const renderLLMSettings = () => (
    <>
      <LocalStorageInput
        storageKey="llm_engine_name"
        label="LLM Engine"
        placeholder="openai/gpt-4.1"
        help="The LLM engine to use for reasoning and code generation."
        type="text"
      />

      <LocalStorageInput
        storageKey="llm_api_base"
        label="LLM API Base URL (optional)"
        placeholder="https://api.example.com"
        help="OpenAI-compatible URL for the LLM API service. Derived from LLM engine name if not provided."
        type="text"
      />

      <LocalStorageInput
        storageKey="llm_api_key"
        label="LLM API Key"
        placeholder="Enter your API key"
        help="Your API key for the LLM service."
        type="password"
        showToggle={true}
      />
    </>
  )

  const renderSettings = () => (
    <div className="p-4 space-y-5">
      <div className="flex flex-row items-center gap-4">
        <ThemeDropdown className="" />
        <Label>UI Theme: {savedTheme.toUpperCase()}</Label>
      </div>

      <div className="flex items-center space-x-2">
        <Switch id="resizable-tabs" checked={useResizableTabs} onCheckedChange={val => {
          localStorage.setItem("useResizableTabs", val.toString())
          setUseResizableTabs(val)
        }} />
        <Label htmlFor="resizable-tabs">Use Resizable Tabs</Label>
      </div>

      <div className="flex items-center space-x-2">
        <Switch id="self-debug" checked={useSelfDebug} onCheckedChange={(val) => setUseSelfDebug(val)} />
        <Label htmlFor="self-debug">Use Self-Debug</Label>
      </div>

      {renderLLMSettings()}
    </div>
  )

  const renderHistoryBlock = (message: ReasoningItem, item: ReasoningItemBlock) => {
    if (item.type === "text") {
      return (
        <div className="break-words">
          <MarkdownRenderer content={item.content} />
        </div>
      )
    } else {
      const blockIdx = message.items.filter((d) => d.type === "code").indexOf(item)
      const codeFileIndex = codeFiles.findIndex((f) => f.history_id === message.id && f.block_index === blockIdx)
      const codeFile = codeFiles[codeFileIndex]
      return (
        <CodeBlockRenderer
          showToolbar={message.tag !== "system"}
          isLoading={!item.completed && isGenerating}
          content={codeFile ? codeFile.content : item.content}
          codeFile={codeFile}
          onOpenInEditor={() => {
            if (useResizableTabs) {
              setActivePanel("program")
            } else {
              setMainTab("program")
            }
            setSelectedProgramIndex(codeFileIndex)
          }}
        />
      )
    }
  }

  const renderTaskInputs = (labelPrefix: string, textSize="text-base") => (
    <>
      <div>
        <Label htmlFor={`${labelPrefix}_task_inst`} className={`${textSize} font-semibold flex items-center gap-2`}>
          <FileText className="h-5 w-5 text-primary" />
          Task Instruction
          <TooltipProvider>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  Describe what you want to analyze or visualize. Be specific about the data and desired
                  outcome.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Label>
        <Textarea
          id={`${labelPrefix}_task_inst`}
          placeholder="Example: Create a map showing public transit coverage overlaid with population density using the provided shapefiles."
          value={taskInst}
          onChange={(e) => {
            setTaskInst(e.target.value)
            updateTaskInputs()
          }}
          className="mt-2 min-h-32 text-base"
        />
      </div>
      <div>
        <Label htmlFor={`${labelPrefix}_domain_knowledge`} className={`${textSize} font-semibold flex items-center gap-2`}>
          <Info className="h-5 w-5 text-primary" />
          Domain Knowledge
          <TooltipProvider>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  Add any specialized knowledge or context that might help with your analysis.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </Label>
        <Textarea
          id={`${labelPrefix}_domain_knowledge`}
          placeholder="Example: Transit accessibility is measured by the percentage of population within 0.5 miles of a transit stop."
          value={domainKnowledge}
          onChange={(e) => {
            setDomainKnowledge(e.target.value)
            updateTaskInputs()
          }}
          className="mt-2 min-h-32 text-base"
        />
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className={`${textSize} font-semibold flex items-center gap-2`}>
            <Files className="h-5 w-5 text-primary" />
            Data Files ({uploadedFiles.length})
            <TooltipProvider>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full">
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">Upload your data files (CSV, shapefiles, etc.) for analysis.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 flex items-center gap-1"
            onClick={(e) => {
              e.preventDefault()
              setSidebarFilesDropdownOpen(!sidebarFilesDropdownOpen)
            }}
          >
            {sidebarFilesDropdownOpen ? "Hide Files" : "Show Files"}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${sidebarFilesDropdownOpen ? "" : "-rotate-90"}`}
            />
          </Button>
        </div>
        <div className="mb-6 grid grid-cols-1">
          <FileUploader
            files={sidebarFilesDropdownOpen ? uploadedFiles : []}
            onFilesAdded={handleFilesAdded}
            onFileDelete={handleFileDelete}
            multiple={true}
            maxSize={100 * 1024 * 1024 * 2}
          />
        </div>
      </div>
    </>
  )

  const renderReasoningPanel = () => (
    <div className="w-full h-full flex flex-col">
      <ScrollArea
        className="px-4 w-full flex-1"
        onScroll={(event) => {
          const target = event.currentTarget
          const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 150
          setUserScrolledReasoning(!isAtBottom)
        }}
      >
        <Card className="max-w-4xl m-auto mt-4 mb-6">
          {!isInstructionEditable ? (<>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Task Information
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setIsInstructionEditable(true)}
                >
                  <Edit className="h-4 w-4" />
                  <span className="">Edit</span>
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-2">
                <h3 className="font-semibold text-base mb-1">Task Instruction</h3>
                <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-md border border-border">
                  {taskInst}
                </p>
              </div>
              {domainKnowledge && (
                <div className="mb-2">
                  <h3 className="font-semibold text-base mb-1">Domain Knowledge</h3>
                  <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-md border border-border">
                    {domainKnowledge}
                  </p>
                </div>
              )}
              {uploadedFiles.length > 0 && (
                <div>
                  <h3 className="font-semibold text-base mb-1 flex items-center gap-2">
                    <Files className="h-4 w-4" />
                    Files ({uploadedFiles.length})
                  </h3>
                  <ul className="text-sm bg-muted/30 p-3 rounded-md border border-border">
                    {uploadedFiles.map((file, idx) => (
                      <li key={idx} className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="font-mono text-xs">
                          {formatFileSize(file.size)}
                        </Badge>
                        {file.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </>) : (<>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl flex items-center gap-2">
                <span className="bg-primary text-primary-foreground w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold">1</span>
                Define Your Task
                {reasoningCounter > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setIsInstructionEditable(false)}
                  >
                    <ChevronUp className="h-4 w-4" />
                    <span className="">Collapse</span>
                  </Button>
                )}
              </CardTitle>
              <CardDescription>Describe what you want to analyze or visualize</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6 space-y-5">{renderTaskInputs("reasoning", "text-lg")}</div>
            </CardContent>
            <CardFooter className="flex justify-end">
              {reasoningCounter > 0 && <AlertDialog>
                <AlertDialogTrigger disabled={isGenerating} asChild>
                  <Button
                    disabled={isGenerating}
                    className="font-bold py-6 text-lg gap-2"
                    size="lg"
                  >
                    Restart Analysis
                    <ArrowBigRight className="w-5 h-5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure you want to restart the analysis?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action will permanently clear the current analysis, code files, execution traces, and output files.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSolveTask}>Continue</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>}

              {reasoningCounter == 0 && 
              <Button
                onClick={handleSolveTask}
                disabled={isGenerating}
                className="font-bold py-6 text-lg gap-2"
                size="lg"
              >
                Generate Analysis
                <ArrowBigRight className="w-5 h-5" />
              </Button>}
            </CardFooter>
          </>)}
          </Card>

        {reasoningProcess.map(
          (message, idx) =>
            message.tag !== "system" && (
              <div
                key={idx}
                className={`relative mb-4 max-w-4xl grid grid-cols-1 min-w-0 m-auto p-5 rounded-2xl rounded-br-md ${message.role === "user" ? "bg-muted" : "bg-background"}`}
              >
                <div className="font-semibold mb-2 flex items-center gap-2">
                  {message.role === "user" ? (
                    <>
                      <Badge variant="outline" className="bg-primary/10">
                        You
                      </Badge>
                    </>
                  ) : (
                    <>
                      <Badge variant="secondary">
                        AI Assistant
                      </Badge>
                    </>
                  )}
                </div>
                {message.items.map((item, i) => (
                  <div key={i}>{renderHistoryBlock(message, item)}</div>
                ))}
              </div>
            ),
        )}

        {generationError && (
          <div className="m-auto p-4 bg-destructive/15 rounded-lg border border-destructive text-sm w-fit min-w-20 font-bold flex flex-row align-middle justify-center gap-2 mb-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Request stopped unexpectedly: {generationError}
          </div>
        )}

        <div ref={reasoningRef} />
      </ScrollArea>

      {reasoningProcess.length > 0 && (
        <div className="relative flex px-4 w-[40rem] max-w-full m-auto rounded-2xl mb-4">
          <Button
            variant="outline"
            className={`absolute top-1 left-2 translate-x-1/2 z-10 w-8 h-8 rounded-full shadow-md bg-muted transition-all duration-300 ${userScrolledReasoning ? "opacity-100 -translate-y-10" : "opacity-0 translate-y-0"}`}
            onClick={() => reasoningRef.current?.scrollIntoView({ behavior: "smooth" })}
          >
            <ArrowDown className="h-6 w-6" />
          </Button>

          <Textarea
            placeholder="Type your message..."
            className="flex-1 p-5 rounded-2xl bg-muted min-h-[60px] max-h-[150px] resize-none"
            onKeyDown={(e) => {
              // Allow Shift+Enter for new lines
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                addUserMessage(e)
              }
              // Auto-adjust height
              const textarea = e.target as HTMLTextAreaElement
              textarea.style.height = "auto"
              textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
            }}
            onChange={(e) => {
              // Auto-adjust height on typing
              const textarea = e.target as HTMLTextAreaElement
              textarea.style.height = "auto"
              textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
            }}
            id="chat-input"
          />
          <Button
            className="absolute right-8 rounded-md bottom-0 -translate-y-1/2"
            variant="ghost"
            disabled={isGenerating}
            onClick={() => {
              const input = document.getElementById("chat-input") as HTMLInputElement
              if (input && input.value.trim()) {
                addUserMessage({ key: "Enter", target: input })
              }
            }}
          >
            <Send className="!h-5 !w-5" />
          </Button>
        </div>
      )}
    </div>
  )

  const renderProgramPanel = () => {
    if (codeFiles.length === 0) {
      return (
        <div className="p-6 text-center w-full flex flex-col items-center justify-center h-full">
          <FileCode className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-medium mb-2">No Code Generated Yet</h3>
          <p className="text-muted-foreground max-w-md mb-4">
            Once the AI generates code for your analysis, it will appear here for you to review and run.
          </p>
          {reasoningCounter === 0 && (
            <Button onClick={handleSolveTask} disabled={isGenerating} className="mt-4">
              Generate Analysis
              <ArrowBigRight className="ml-2 w-5 h-5" />
            </Button>
          )}
        </div>
      )
    }

    return <CodeEditorPanel
      codeFiles={codeFiles}
      selectedProgramIndex={selectedProgramIndex}
      isDiffViewActive={isDiffViewActive}
      isRunning={isRunning}
      isGenerating={isGenerating}
      executionLog={executionLog}
      onSelectedProgramIndexChange={setSelectedProgramIndex}
      onDiffViewActiveChange={setIsDiffViewActive}
      onRunProgram={handleRunProgram}
      onProgramContentChange={updateProgramContent}
      onExecutionLogClear={() => setExecutionLog([])}
    />
  }

  const renderResultsPanel = () => <ResultsPanel
    outputFiles={outputFiles}
    isProgramRunnable={codeFiles.length > 0}
    isBusy={isRunning || isGenerating}
    onRunProgram={() => handleRunProgram(codeFiles[selectedProgramIndex])}
  />

  const renderStandardTabs = () => (
    <Tabs
      value={mainTab}
      onValueChange={(val) => setMainTab(val as PanelType)}
      className="h-screen flex flex-col flex-1 w-full"
    >
      <TabsList className="flex justify-between border-border bg-background min-h-[5rem] max-h-[4rem] align-middle w-full p-0 m-0">
        <TabsTrigger value="reasoning" className="flex-1 text-lg py-4 px-6">
          <MessageSquare className="w-5 h-5 mr-3" />
          Reasoning Process
        </TabsTrigger>
        <TabsTrigger value="program" className="flex-1 text-lg py-4 px-6">
          <FileCode className="w-5 h-5 mr-3" />
          Generated Program
        </TabsTrigger>
        {outputFiles.length > 0 && (
          <TabsTrigger value="results" className="flex-1 text-lg py-4 px-6">
            <BarChart className="w-5 h-5 mr-3" />
            Execution Results
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="reasoning" className="flex-1 h-[calc(100vh-4rem)] mt-0 overflow-hidden">
        <div className="w-full h-full">{renderReasoningPanel()}</div>
      </TabsContent>

      <TabsContent value="program" className="flex-1 h-[calc(100vh-4rem)] mt-0 overflow-hidden">
        <div className="w-full h-full">{renderProgramPanel()}</div>
      </TabsContent>

      {outputFiles.length > 0 && (
        <TabsContent value="results" className="flex-1 h-[calc(100vh-4rem)] mt-0 overflow-hidden">
          <div className="w-full h-full">{renderResultsPanel()}</div>
        </TabsContent>
      )}
    </Tabs>
  )

  const renderResizablePanels = () => {
    const panels = {
      reasoning: {
        title: "Reasoning Process",
        icon: <MessageSquare className="h-5 w-5 text-primary" />,
        render: renderReasoningPanel,
        defaultSize: 50,
      },
      program: {
        title: "Generated Program",
        icon: <FileCode className="h-5 w-5 text-primary" />,
        render: renderProgramPanel,
        defaultSize: 50,
      },
      results: {
        title: "Execution Results",
        icon: <BarChart className="h-5 w-5 text-primary" />,
        render: renderResultsPanel,
        defaultSize: 25,
      },
    }

    return (
      <ResizablePanels
        panels={panels}
        activatedPanels={activatedPanels}
        isRunning={isRunning}
      />
    )
  }

  useEffect(() => {
    if (codeFiles.length > 0 &&
      !(codeFiles.length === 1 && codeFiles[0].is_gold)) {
      setActivatedPanels((prev) => prev.includes("program") ? prev : [...prev, "program"])
    }

    // Remove results panel when there are no output files
    if (outputFiles.length === 0 && activatedPanels.includes("results")) {
      setActivatedPanels((prev) => prev.filter((p) => p !== "results"))
      if (activePanel === "results") {
        setActivePanel(activatedPanels.filter((p) => p !== "results")[0] || "reasoning")
      }
    }

    // Show the results panel whenever output files exist
    if (outputFiles.length > 0) {
      setActivatedPanels((prev) => prev.includes("results") ? prev : [...prev, "results"])
    }
  }, [codeFiles, useResizableTabs, outputFiles, activePanel, isRunning])

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen flex-col gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-bold">Error</h2>
        <p className="text-muted-foreground">{error}</p>
        <Button variant="default" onClick={() => window.location.reload()}>
          Reload Application
        </Button>
      </div>
    )
  }

  if (!agentSession || !isConnected) {
    return (
      <div className="flex items-center justify-center h-screen flex-col gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-primary"></div>
        <div className="font-bold text-xl">
          {!agentSession ? "Connecting to Science Agent..." : "Connection lost, reconnecting to Science Agent..."}
        </div>
        <p className="text-muted-foreground max-w-md text-center">
          This may take a few moments. Please wait while we establish a secure connection.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-screen text-primary">
      <Button
        variant="outline"
        size="icon"
        className={`fixed top-5 z-40 transition-all duration-100 ${isSidebarOpen ? "left-5" : "left-3"} opacity-80`}
        onClick={toggleSidebar}
      >
        {isSidebarOpen ? <SidebarClose className="!h-6 !w-6" /> : <Settings className="!h-6 !w-6" />}
      </Button>

      <div
        className={`border-r border-border transition-all duration-100 fixed top-0 left-0 z-30 h-full ${isSidebarOpen ? "w-[22rem]" : "w-16"
          } flex flex-col justify-start bg-background shadow-md`}
      >
        <div
          className={`flex items-center justify-between min-h-[5rem] max-h-[5rem] ${isSidebarOpen ? "px-6 pl-16" : "justify-center px-2"} border-b border-border`}
        >
          {isSidebarOpen && (
            <>
              <h1 className="text-xl text-primary font-extrabold tracking-tighter">ScienceAgentBench</h1>
            </>
          )}
        </div>

        {!isSidebarOpen && (
          <div className="flex flex-col items-center h-full justify-end pb-6 space-y-2">
            <Link to="/gallery">
              <Button variant="outline" size="icon" className="relative group text-base mt-4">
                <House className="w-5 h-5" />
                <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap">
                  Gallery
                </span>
              </Button>
            </Link>
            <div className="flex-1" />
            <ThemeToggle />
          </div>
        )}

        {isSidebarOpen && (
          <div
            className={`transition-opacity duration-100 ${isSidebarOpen && !isTransitioning ? "opacity-100" : "opacity-0 pointer-events-none"
              }]`}
          >
            <Tabs value={sidebarTab} onValueChange={(val) => setSidebarTab(val as "input" | "settings")} className="">
              <TabsList className="w-full rounded-none justify-start h-12 bg-muted/30">
                <TabsTrigger value="input" className="gap-2 text-base font-semibold data-[state=active]:bg-background">
                  <Zap className="h-5 w-5" /> Task Input
                </TabsTrigger>
                <TabsTrigger value="settings" className="gap-2 text-base font-semibold data-[state=active]:bg-background">
                  <Settings className="h-5 w-5" /> Settings
                </TabsTrigger>
              </TabsList>
              <TabsContent value="input" className="">
                <div className="flex flex-col h-[calc(100vh-8rem)]">
                  <ScrollArea className="flex-1 overflow-auto">
                    <div className="p-4 space-y-5">{renderTaskInputs("side_panel")}</div>
                  </ScrollArea>
                  <div className="p-4 bg-background border-t border-border">

                    {reasoningCounter > 0 && <AlertDialog>
                      <AlertDialogTrigger disabled={isGenerating} className="w-full" asChild>
                        <Button
                          disabled={isGenerating}
                          className="font-bold w-full py-6 text-lg gap-2"
                          size="lg"
                        >
                          Restart Analysis
                          <ArrowBigRight className="w-5 h-5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure you want to restart the analysis?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action will permanently clear the current analysis, code files, execution traces, and output files.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleSolveTask}>Continue</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>}

                    {reasoningCounter == 0 && 
                    <Button
                      onClick={handleSolveTask}
                      disabled={isGenerating}
                      className="font-bold w-full py-6 text-lg gap-2"
                      size="lg"
                    >
                      Generate Analysis
                      <ArrowBigRight className="w-5 h-5" />
                    </Button>}
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="settings" className="">
                <ScrollArea className="h-[calc(100vh-5rem)]">{renderSettings()}</ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      <div
        className={`flex-1 flex flex-col transition-all duration-100 w-full ${isSidebarOpen ? "pl-[22rem]" : "pl-16"}`}
      >
        {(isGenerating || isRunning) && (
          <div
            className={`fixed bottom-16 left-1/2 transform -translate-x-1/2 z-50 rounded-lg p-4 bg-background border border-border shadow-lg flex items-center justify-center`}
          >
            <div className="flex items-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary"></div>
              <div>
                <p className="font-medium">{isGenerating ? "Generating Analysis..." : "Running Program..."}</p>
              </div>
              <Button variant="destructive" className="ml-4" onClick={handleCancel}>
                <Square className="h-4 w-4 mr-2" />
                Stop
              </Button>
            </div>
          </div>
        )}
        {reasoningCounter == 0 && <WorkflowStepsIndicator currentStep={currentStep}/>}
        {useResizableTabs ? renderResizablePanels() : renderStandardTabs()}
      </div>

      {showLLMModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg bg-background border border-border rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <AlertCircle className="inline-block" />
                Configure LLM Provider
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              You need to configure your LLM provider in order to generate analyses and code.
              You can set this up now or set it later in settings.
            </p>

            <div className="space-y-4">
              {renderLLMSettings()}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="ghost" onClick={() => setShowLLMModal(false)}>
                Set Later in Settings
              </Button>
              <Button onClick={() => setShowLLMModal(false)}>
                Save & Continue
              </Button>
            </div>
          </div>
        </div>
      )}

      <HelpModal />
    </div>
  )
}

export default Execution
