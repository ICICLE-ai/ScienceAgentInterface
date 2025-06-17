"use client"

import React from "react"
import { useState, useEffect, useRef } from "react"
import {
  FileCode,
  Terminal,
  ArrowBigRight,
  Files,
  Download,
  Play,
  Copy,
  Undo2,
  ChevronDown,
  FileDiff,
  SidebarClose,
  SidebarOpen,
  Settings,
  Zap,
  MessageSquare,
  Minimize2,
  Square,
  Send,
  GripVertical,
  Columns,
  Info,
  FileText,
  BarChart,
  HelpCircle,
  AlertCircle,
  CheckCircle2,
  ArrowDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { useDebouncedCallback } from "use-debounce"
import { Link } from "react-router-dom"
import { useTheme } from "@/components/theme-provider"
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
import Editor, { useMonaco, DiffEditor } from "@monaco-editor/react"
import { ThemeModeToggle } from "@/components/ui/theme-mode-toggle"
import { Label } from "@/components/ui/label"
import { rgbToHex, formatFileSize, throttle, scrollIntoView, downloadText } from "@/lib/utils"
import { FileUploader, type UploadedFile } from "@/components/ui/file-uploader"
import MarkdownRenderer from "@/components/MarkdownRenderer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { InteractiveResultsPanel } from "./InteractiveResultsPanel"
import HelpModal from "./HelpModal"
import WorkflowStepsIndicator from "./WorkflowStepsIndicator"
import { CodeBlockRenderer } from "@/components/CodeBlockRenderer"
import { ConsoleOutputRenderer } from "@/components/ConsoleOutputRenderer"
import "./panel-drag.css" // Import the CSS for resizable panels

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

interface PanelSize {
  id: "reasoning" | "program" | "results"
  size: number
}

interface PanelHandle {
  getSize: () => number
  resize: (size: number) => void
}

const Execution = () => {
  const [useResizableTabs, setUseResizableTabs] = useState<boolean>(true)
  const [mainTab, setMainTab] = useState<"reasoning" | "program" | "results">("reasoning")
  const [activePanel, setActivePanel] = useState<"reasoning" | "program" | "results">("reasoning")
  const [visiblePanels, setVisiblePanels] = useState<("reasoning" | "program" | "results")[]>(["reasoning"])
  const [minimizedPanels, setMinimizedPanels] = useState<("reasoning" | "program" | "results")[]>([])
  const [panelSizes, setPanelSizes] = useState<PanelSize[]>([
    { id: "reasoning", size: 40 },
    { id: "program", size: 35 },
    { id: "results", size: 25 },
  ])
  const [sidebarTab, setSidebarTab] = useState<"input" | "settings">("input")
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false)
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false)
  const [isDiffViewActive, setIsDiffViewActive] = useState<boolean>(false)
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [editorHeight, setEditorHeight] = useState<number>(70)
  const [consoleHeight, setConsoleHeight] = useState<number>(30)
  const [draggedPanel, setDraggedPanel] = useState<"reasoning" | "program" | "results" | null>(null)
  const [dragOverPanel, setDragOverPanel] = useState<"reasoning" | "program" | "results" | null>(null)
  const [draggedPanelRect, setDraggedPanelRect] = useState<DOMRect | null>(null)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [sidebarFilesDropdownOpen, setSidebarFilesDropdownOpen] = useState<boolean>(false)
  const [hasGenerationStarted, setHasGenerationStarted] = useState<boolean>(false)
  const [currentStep, setCurrentStep] = useState<number>(1)
  const [userScrolledReasoning, setUserScrolledReasoning] = useState<boolean>(false)
  const [userScrolledExecutionLog, setUserScrolledExecutionLog] = useState<boolean>(false)
  const [agentSession, setAgentSession] = useState<AgentSession>()
  const [domainKnowledge, setDomainKnowledge] = useState<string>("")
  const [description, setDescription] = useState<string>("")
  const [taskInst, setTaskInst] = useState<string>("")
  const [useSelfDebug, setUseSelfDebug] = useState<boolean>(true)
  const [error, setError] = useState<string>("")
  const [reasoningProcess, setReasoningProcess] = useState<ReasoningItem[]>([])
  const [codeFiles, setCodeFiles] = useState<CodeFile[]>([])
  const [selectedProgramIndex, setSelectedProgramIndex] = useState<number>(0)
  const [compareVersionIndex, setCompareVersionIndex] = useState<number>(0)
  const [reasoningCounter, setReasoningCounter] = useState<number>(0)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [executionLog, setExecutionLog] = useState<ExecutionLogEntry[]>([])
  const [executionLogCounter, setExecutionLogCounter] = useState<number>(0)
  const [generationError, setGenerationError] = useState<string>("")
  const [outputFiles, setOutputFiles] = useState<OutputFile[]>([])
  const [showExecutionDetails, setShowExecutionDetails] = useState<boolean>(true)
  const [apiKeys, setApiKeys] = useState<{
    openai: string
    aws_bedrock: string
    anthropic: string
    deepseek: string
  }>({
    openai: "",
    aws_bedrock: "",
    anthropic: "",
    deepseek: "",
  })
  const [visibleKeys, setVisibleKeys] = useState<{
    openai: boolean
    aws_bedrock: boolean
    anthropic: boolean
    deepseek: boolean
  }>({
    openai: false,
    aws_bedrock: false,
    anthropic: false,
    deepseek: false,
  })
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [isRunning, setIsRunning] = useState<boolean>(false)

  const reasoningRef = useRef<HTMLDivElement>(null)
  const executionLogRef = useRef<HTMLDivElement>(null)
  const panelRefs = useRef<Record<string, PanelHandle | null>>({
    reasoning: null,
    program: null,
    results: null,
  })

  // Track mouse position during drag with throttling
  const updateGhostPosition = useRef(
    throttle((e: MouseEvent) => {
      if (!draggedPanelRect) return

      document.documentElement.style.setProperty("--mouse-x", `${e.clientX}px`)
      document.documentElement.style.setProperty("--mouse-y", `${e.clientY}px`)
      document.documentElement.style.setProperty("--offset-x", `${e.clientX - draggedPanelRect.left}px`)
      document.documentElement.style.setProperty("--offset-y", `${e.clientY - draggedPanelRect.top}px`)
    }, 16),
  ).current

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      updateGhostPosition(e)
    }

    window.addEventListener("mousemove", handleMouseMove)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
    }
  }, [isDragging, draggedPanelRect, updateGhostPosition])

  // Load resizable tabs preference from localStorage
  useEffect(() => {
    const savedPreference = localStorage.getItem("useResizableTabs")
    if (savedPreference !== null) {
      setUseResizableTabs(savedPreference === "true")
    }
  }, [])

  // Save resizable tabs preference to localStorage
  useEffect(() => {
    localStorage.setItem("useResizableTabs", useResizableTabs.toString())
  }, [useResizableTabs])

  useEffect(() => {
    if (isTransitioning) {
      const timer = setTimeout(() => setIsTransitioning(false), 100)
      return () => clearTimeout(timer)
    }
  }, [isTransitioning])

  // Setup resize event listeners to disable transitions during resize
  useEffect(() => {
    document.addEventListener("mousedown", (e) => {
      // Check if clicking on a resize handle
      if (e.target && (e.target as HTMLElement).closest(".resizable-handle")) {
        document.body.classList.add("resizing")

        // Add document-wide listeners to detect when resizing ends
        const onMouseUp = () => {
          setTimeout(() => document.body.classList.remove("resizing"), 50)
          document.removeEventListener("mouseup", onMouseUp)
        }

        document.addEventListener("mouseup", onMouseUp, { once: true })
      }
    })

    return () => {
      document.body.classList.remove("resizing")
    }
  }, [])

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

    if (!data) {
      return
    }

    switch (data.type) {
      case "state":
        initState(data.state)
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

              // Everything after the first \`\`\`python
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
          // If we are in code mode and see \`\`\`
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
        setExecutionLogCounter((n) => n + 1)
        break
      case "execution_chunk":
        lastExecLog.output += data.output
        setExecutionLogCounter((n) => n + 1)
        break
      case "execution_end":
        lastExecLog.exit_code = data.exit_code
        lastExecLog.end_time = data.end_time
        setExecutionLogCounter((n) => n + 1)
        break
      case "output_files":
        setOutputFiles(data.files)
        break
      default:
        console.warn("Unhandled message type", data)
    }
  }

  const savedAgentSessionId = localStorage.getItem("agentSessionId")
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
      setHasGenerationStarted(false)

      // If sidebar is not open, open it for new tasks
      if (!isSidebarOpen) {
        setIsTransitioning(true)
        setIsSidebarOpen(false)
        setSidebarTab("input")
      }
    }
    // Otherwise, if there's history, set hasGenerationStarted to true
    else if (state.history.length > 0) {
      setHasGenerationStarted(true)
    }

    // replay the history
    reasoningProcess.length = 0
    setReasoningProcess([])
    state.history.forEach((item) => {
      handleAgentMessage({ type: "response_start", role: item.role, tag: item.tag, id: item.id }, null)
      handleAgentMessage({ type: "response_chunk", text: item.content, id: item.id }, null)
    })
  }

  const handleConnectionChange = (connected: boolean) => {
    setIsConnected(connected)
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
      try {
        const agentSessionId = savedAgentSessionId || (await createAgentSession()).agent_session_id

        if (!agentSessionId) {
          setError("Failed to start agent session: No session ID received.")
          return
        }

        localStorage.setItem("agentSessionId", agentSessionId)

        ws.current?.close()
        ws.current = new AgentWebSocketConnection(agentSessionId, handleAgentMessage, handleConnectionChange)

        if (savedAgentSessionId) {
          const res = await validateAgentSession(savedAgentSessionId)
          if (res.error) {
            console.error("Error validating agent session:", res.error)
            setError(res.error)
            return
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
  useEffect(() => scrollIntoView(false, executionLogRef), [executionLogCounter])

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

  // ---------- Monaco ----------
  const monaco = useMonaco()
  useEffect(() => {
    if (monaco) {
      // Need to wait for the background color to be changed after the theme switch
      setTimeout(() => {
        const bgCol = rgbToHex(window.getComputedStyle(document.body).getPropertyValue("background"))
        monaco.editor.defineTheme("custom-theme", {
          base: theme === "dark" ? "vs-dark" : "vs",
          inherit: true,
          rules: [],
          colors: {
            "editor.background": bgCol,
          },
        })
        monaco.editor.setTheme("custom-theme")
      }, 0)
    }
  }, [monaco, theme])

  const editorOptions = {
    minimap: { enabled: false },
    fontSize: 14,
    lineHeight: 1.4,
    padding: { top: 16, bottom: 16 },
  }

  const toggleSidebar = () => {
    setIsTransitioning(true)
    setIsSidebarOpen(!isSidebarOpen)
  }

  const handleSolveTask = () => {
    if (!taskInst) {
      toast.error("Please provide a task instruction.")
      return
    }

    if (hasGenerationStarted && reasoningProcess.length > 0) {
      setCodeFiles(codeFiles => codeFiles.filter((f) => f.is_gold))
      setReasoningProcess([])
      setExecutionLog([])
      setOutputFiles([])
    }

    setIsGenerating(true)
    setHasGenerationStarted(true)
    setGenerationError("")
    setCurrentStep(2) // Move to step 2 (Processing)

    safeRunCommand("solve_task", undefined, 0)
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
        ?.runCommand("follow_up", { message: message, code_id: codeFiles[selectedProgramIndex].id }, 0)
        .catch((err: unknown) => setGenerationError(err instanceof Error ? err.message : String(err)))
        .finally(() => setIsGenerating(false))
    }
  }

  // Get saved panel size
  const getPanelSize = (panel: "reasoning" | "program" | "results"): number => {
    const savedSize = panelSizes.find((p) => p.id === panel)
    return savedSize ? savedSize.size : 33 // Default to 33% if not found
  }

  const togglePanelMinimize = (panel: "reasoning" | "program" | "results") => {
    if (minimizedPanels.includes(panel)) {
      // Restore panel
      setMinimizedPanels((prev) => prev.filter((p) => p !== panel))
      setVisiblePanels((prev) => {
        // Insert at the correct position
        const newPanels = [...prev]
        if (panel === "reasoning") {
          return ["reasoning", ...newPanels.filter((p) => p !== "reasoning")]
        } else if (panel === "program") {
          const reasoningIndex = newPanels.indexOf("reasoning")
          if (reasoningIndex !== -1) {
            newPanels.splice(reasoningIndex + 1, 0, "program")
            return newPanels
          }
        }
        return [...newPanels, panel]
      })
    } else {
      // Minimize panel
      setMinimizedPanels((prev) => [...prev, panel])
      setVisiblePanels((prev) => prev.filter((p) => p !== panel))

      // If this was the active panel, activate another visible panel
      if (activePanel === panel) {
        const remainingPanels = visiblePanels.filter((p) => p !== panel)
        if (remainingPanels.length > 0) {
          setActivePanel(remainingPanels[0])
        }
      }
    }
    // Trigger a reflow to force the layout to update smoothly
    setTimeout(() => window.dispatchEvent(new Event("resize")), 50)
  }

  // Handle drag start for panel reordering
  const handleDragStart = (panel: "reasoning" | "program" | "results", e: React.DragEvent) => {
    e.stopPropagation()

    // Store the panel being dragged
    setDraggedPanel(panel)
    setIsDragging(true)

    // Store the panel's dimensions for visual feedback during drag
    const panelElement = e.currentTarget.closest("[data-resizable-panel-id]") as HTMLElement
    if (panelElement) {
      const rect = panelElement.getBoundingClientRect()
      setDraggedPanelRect(rect)

      // Create a transparent drag image (1x1 pixel) to hide the browser's default drag image
      const emptyImg = document.createElement("img")
      emptyImg.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" // transparent 1x1 pixel
      e.dataTransfer.setDragImage(emptyImg, 0, 0)

      // Set initial CSS variables for position
      document.documentElement.style.setProperty("--mouse-x", `${e.clientX}px`)
      document.documentElement.style.setProperty("--mouse-y", `${e.clientY}px`)
      document.documentElement.style.setProperty("--offset-x", `${e.clientX - rect.left}px`)
      document.documentElement.style.setProperty("--offset-y", `${e.clientY - rect.top}px`)
      document.documentElement.style.setProperty("--panel-width", `${rect.width}px`)
      document.documentElement.style.setProperty("--panel-height", `${rect.height}px`)
      document.documentElement.style.setProperty("--panel-top", `${rect.top}px`)
      document.documentElement.style.setProperty("--panel-left", `${rect.left}px`)

      // Add a class to the body to indicate dragging is in progress
      document.body.classList.add("panel-dragging")

      // Create a visual clone of the panel for dragging
      const panelDragGhost = document.createElement("div")
      panelDragGhost.id = "panel-drag-ghost"
      panelDragGhost.style.position = "fixed"
      panelDragGhost.style.top = "0"
      panelDragGhost.style.left = "0"
      panelDragGhost.style.width = `${rect.width}px`
      panelDragGhost.style.height = `${rect.height}px`
      panelDragGhost.style.backgroundColor = "hsl(var(--background))"
      panelDragGhost.style.border = "2px solid hsl(var(--primary))"
      panelDragGhost.style.borderRadius = "8px"
      panelDragGhost.style.boxShadow = "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
      panelDragGhost.style.opacity = "0.7"
      panelDragGhost.style.zIndex = "9999"
      panelDragGhost.style.pointerEvents = "none"
      panelDragGhost.style.transform = `translate(calc(var(--mouse-x) - var(--offset-x)), calc(var(--mouse-y) - var(--offset-y)))`
      panelDragGhost.style.willChange = "transform" // Hint to browser to optimize transforms

      // Add the panel header
      const header = document.createElement("div")
      header.className = "panel-drag-header"
      header.style.height = "48px"
      header.style.borderBottom = "1px solid hsl(var(--border))"
      header.style.padding = "0 12px"
      header.style.display = "flex"
      header.style.alignItems = "center"
      header.style.backgroundColor = "hsl(var(--background))"
      header.style.borderTopLeftRadius = "8px"
      header.style.borderTopRightRadius = "8px"

      // Add the panel title
      const title = document.createElement("div")
      title.style.fontWeight = "bold"
      title.textContent =
        panel === "reasoning" ? "Reasoning Process" : panel === "program" ? "Generated Program" : "Execution Results"
      header.appendChild(title)
      panelDragGhost.appendChild(header)

      // Add a content placeholder
      const content = document.createElement("div")
      content.style.padding = "12px"
      content.style.height = "calc(100% - 48px)"
      content.style.overflow = "hidden"
      content.style.backgroundColor = "hsl(var(--background))"
      content.style.borderBottomLeftRadius = "8px"
      content.style.borderBottomRightRadius = "8px"
      panelDragGhost.appendChild(content)

      document.body.appendChild(panelDragGhost)
    }
  }

  // Update the ghost panel position during drag using requestAnimationFrame
  useEffect(() => {
    if (!isDragging || !draggedPanelRect) return

    let animationFrameId: number

    const updateGhostPosition = () => {
      const ghost = document.getElementById("panel-drag-ghost")
      if (ghost) {
        // Use CSS variables for smoother transforms
        ghost.style.transform = `translate(calc(var(--mouse-x) - var(--offset-x)), calc(var(--mouse-y) - var(--offset-y)))`
        animationFrameId = requestAnimationFrame(updateGhostPosition)
      }
    }

    // Start the animation loop
    animationFrameId = requestAnimationFrame(updateGhostPosition)

    return () => {
      // Clean up animation frame on unmount or when dragging stops
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [isDragging, draggedPanelRect])

  // Handle drag over for panel reordering
  const handleDragOver = (e: React.DragEvent, panel: "reasoning" | "program" | "results") => {
    if (Array.from(e.dataTransfer.types).includes("Files")) return // Lets you drag files normally

    e.preventDefault()
    e.stopPropagation()

    if (draggedPanel && draggedPanel !== panel) {
      setDragOverPanel(panel)

      console.log("Dragging over panel:", panel)

      // Add visual feedback to the drop target
      const allPanels = document.querySelectorAll("[data-resizable-panel-id]")
      allPanels.forEach((el) => {
        if (el.getAttribute("data-resizable-panel-id") === panel) {
          el.classList.add("panel-drop-target")
        } else {
          el.classList.remove("panel-drop-target")
        }
      })
    }
  }

  // Handle drop for panel reordering
  const handleDrop = (e: React.DragEvent, targetPanel: "reasoning" | "program" | "results") => {
    if (Array.from(e.dataTransfer.types).includes("Files")) return // Lets you drop files normally

    e.preventDefault()
    e.stopPropagation()

    // Clean up drag visual elements
    cleanupDragVisuals()

    if (draggedPanel && draggedPanel !== targetPanel) {
      // Swap panel positions
      setVisiblePanels((prev) => {
        const newPanels = [...prev]
        const draggedIndex = newPanels.indexOf(draggedPanel)
        const targetIndex = newPanels.indexOf(targetPanel)

        if (draggedIndex !== -1 && targetIndex !== -1) {
          [newPanels[draggedIndex], newPanels[targetIndex]] = [newPanels[targetIndex], newPanels[draggedIndex]]
        }

        return newPanels
      })
    }
  }

  // Handle drag end
  const handleDragEnd = () => {
    cleanupDragVisuals()
  }

  // Clean up all drag-related visual elements
  const cleanupDragVisuals = () => {
    // Remove the ghost element
    const ghost = document.getElementById("panel-drag-ghost")
    if (ghost) {
      document.body.removeChild(ghost)
    }

    // Remove the panel-dragging class from body
    document.body.classList.remove("panel-dragging")

    // Remove drop target highlights
    const allPanels = document.querySelectorAll("[data-resizable-panel-id]")
    allPanels.forEach((el) => {
      el.classList.remove("panel-drop-target")
    })

    // Reset state
    setDraggedPanel(null)
    setDragOverPanel(null)
    setIsDragging(false)
    setDraggedPanelRect(null)
  }

  const renderSettings = () => (
    <div className="p-4 space-y-5">
      <div className="flex flex-row items-center gap-4">
        <ThemeModeToggle className="" />
        <Label htmlFor="openai_key">UI Theme: {savedTheme.toUpperCase()}</Label>
      </div>

      <div className="flex items-center space-x-2">
        <Switch id="resizable-tabs" checked={useResizableTabs} onCheckedChange={setUseResizableTabs} />
        <Label htmlFor="resizable-tabs">Use Resizable Tabs</Label>
      </div>

      <div className="flex items-center space-x-2">
        <Switch id="self-debug" checked={useSelfDebug} onCheckedChange={(val) => setUseSelfDebug(val)} />
        <Label htmlFor="self-debug">Use Self-Debug</Label>
      </div>
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
              if (minimizedPanels.includes("program")) {
                togglePanelMinimize("program")
              }
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
            <Tooltip>
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
            <Tooltip>
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
              <Tooltip>
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
        {hasGenerationStarted ? (
          // After generation starts, show the minimized task info at the top
          <Card className="max-w-4xl m-auto mt-4 mb-6 cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Task Information
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => {
                    setIsSidebarOpen(!isSidebarOpen)
                    setSidebarTab("input")
                  }}
                >
                  <SidebarOpen className="h-4 w-4" />
                  <span className="ml-1">Edit</span>
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-2">
                <h3 className="font-semibold text-lg mb-1">Task Instruction</h3>
                <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-md border border-border">
                  {taskInst}
                </p>
              </div>
              {domainKnowledge && (
                <div className="mb-2">
                  <h3 className="font-semibold text-lg mb-1">Domain Knowledge</h3>
                  <p className="text-sm whitespace-pre-wrap bg-muted/30 p-3 rounded-md border border-border">
                    {domainKnowledge}
                  </p>
                </div>
              )}
              {uploadedFiles.length > 0 && (
                <div>
                  <h3 className="font-semibold text-lg mb-1 flex items-center gap-2">
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
          </Card>
        ) : (
          // Before generation starts, show the full task input form in the reasoning tab
          <div className="max-w-4xl m-auto mt-4 mb-6">
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl flex items-center gap-2">
                  <span className="bg-primary text-primary-foreground w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold">
                    1
                  </span>
                  Define Your Task
                </CardTitle>
                <CardDescription>Describe what you want to analyze or visualize</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-6 space-y-5">{renderTaskInputs("reasoning", "text-lg")}</div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button
                  onClick={handleSolveTask}
                  disabled={isGenerating}
                  className="font-bold py-6 text-lg gap-2"
                  size="lg"
                >
                  Generate Analysis
                  <ArrowBigRight className="w-5 h-5" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        )}

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
            className="flex-1 p-7 rounded-2xl bg-muted min-h-[60px] max-h-[150px] resize-none"
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
    return (
      <div className="w-full h-full flex flex-col">
        {codeFiles.length > 0 ? (
          <>
            {/* -- Program Header / Version Controls -- */}
            <div className="w-full pl-6 border-b border-border py-3 bg-muted/30">
              <div className="flex gap-3 items-center">
                <Button
                  variant="default"
                  onClick={() => handleRunProgram(codeFiles[selectedProgramIndex])}
                  disabled={isRunning || isGenerating}
                  className="gap-2"
                >
                  <Play className="h-4 w-4" /> Run
                </Button>

                <div className="w-40">
                  <Select
                    onValueChange={(val) => setSelectedProgramIndex(Number.parseInt(val))}
                    disabled={isDiffViewActive}
                    defaultValue={selectedProgramIndex.toString()}
                    value={selectedProgramIndex.toString()}
                  >
                    <SelectTrigger>
                      <SelectValue>{codeFiles[selectedProgramIndex]?.filename}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {codeFiles.map((codeFile, index) => (
                        <SelectItem key={index} value={index.toString()}>
                          {codeFile.filename} {codeFile.is_gold ? "(Gold)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Compare Toggle */}
                {codeFiles.length > 1 && (
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsDiffViewActive(!isDiffViewActive)
                        // Optionally auto-set compareVersionIndex
                        if (!isDiffViewActive) {
                          // e.g., compare the previous version by default
                          setCompareVersionIndex(selectedProgramIndex > 0 ? selectedProgramIndex - 1 : 0)
                        }
                      }}
                      className="gap-2"
                    >
                      <FileDiff className="h-4 w-4" /> {isDiffViewActive ? "Exit Compare" : "Compare Versions"}
                    </Button>

                    {/* If comparing, show a second select for "original" */}
                    {isDiffViewActive && (
                      <div className="w-40">
                        <Select
                          onValueChange={(val) => setCompareVersionIndex(Number.parseInt(val))}
                          defaultValue={compareVersionIndex.toString()}
                          value={compareVersionIndex.toString()}
                        >
                          <SelectTrigger>
                            <SelectValue>{codeFiles[compareVersionIndex].filename}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {codeFiles.map((codeFile, index) => (
                              <SelectItem key={index} value={index.toString()}>
                                {codeFile.filename} {codeFile.is_gold ? "(Gold)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      Options <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>Code Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        navigator.clipboard.writeText(codeFiles[selectedProgramIndex].content)
                        toast("Code copied to clipboard!")
                      }}
                    >
                      <Copy className="h-4 w-4 mr-2" /> Copy Code
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        downloadText(codeFiles[selectedProgramIndex].filename, codeFiles[selectedProgramIndex].user_content)
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" /> Download Code File
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        monaco?.editor.getModels().forEach((model) => {
                          // Replace the content with the initial generated code as an undoable operation
                          model.pushEditOperations([], [{
                            range: model.getFullModelRange(),
                            text: codeFiles[selectedProgramIndex].content
                          }], () => null)
                          codeFiles[selectedProgramIndex].user_content = codeFiles[selectedProgramIndex].content
                          updateProgramContent(codeFiles[selectedProgramIndex].content, codeFiles[selectedProgramIndex])
                          toast("Code reverted to initial generated version.")
                        })
                      }}
                    >
                      <Undo2 className="h-4 w-4 mr-2" /> Revert Changes
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="w-full flex-1 flex flex-col h-[calc(100%-3rem)]">
              <ResizablePanelGroup direction="vertical" className="w-full h-full">
                <ResizablePanel
                  id="panel"
                  defaultSize={editorHeight}
                  minSize={30}
                  onResize={(size) => setEditorHeight(size)}
                  className="h-full"
                >
                  <div className="flex flex-col h-full w-full border-r border-border">
                    {/* -- Editor or DiffEditor -- */}
                    {isDiffViewActive ? (
                      <DiffEditor
                        language="python"
                        original={codeFiles[compareVersionIndex]?.user_content || ""}
                        modified={codeFiles[selectedProgramIndex]?.user_content || ""}
                        theme="custom-theme"
                        options={{ ...editorOptions, readOnly: true }}
                        className="w-full h-full"
                      />
                    ) : (
                      <Editor
                        key={`editor-${selectedProgramIndex}`}
                        defaultLanguage="python"
                        value={codeFiles[selectedProgramIndex]?.user_content || ""}
                        theme="custom-theme"
                        options={editorOptions}
                        className="w-full h-full"
                        onChange={(value) => {
                          if (value) {
                            const codeFile = codeFiles[selectedProgramIndex]
                            // Don't need to update the state here, because the Monaco editor already has this update
                            codeFile.user_content = value
                            updateProgramContent(codeFile.user_content, codeFile)
                          }
                        }}
                      />
                    )}
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                <ResizablePanel
                  defaultSize={consoleHeight}
                  minSize={10}
                  onResize={(size) => setConsoleHeight(size)}
                  className="min-h-0 flex flex-col"
                >
                  <div className="flex flex-col flex-1 h-full min-h-0 w-full">
                    <Collapsible
                      open={showExecutionDetails}
                      onOpenChange={setShowExecutionDetails}
                      className="flex flex-col flex-1 h-full min-h-0"
                    >
                      <div className="pl-4 pb-2 pt-2 border-b border-border w-full bg-muted/30 flex items-center justify-between">
                        <h2 className="flex font-medium items-center gap-2">
                          <Terminal className="h-5 w-5 text-primary" /> Program Output
                        </h2>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setExecutionLog([])
                              setExecutionLogCounter((n) => n + 1)
                            }}
                          >
                            Clear
                          </Button>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="px-2 mr-2">
                              {showExecutionDetails ? "Hide Details" : "Show Details"}
                              <ChevronDown
                                className={`ml-2 h-4 w-4 transition-transform ${showExecutionDetails ? "rotate-180" : ""
                                  }`}
                              />
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                      </div>

                      <CollapsibleContent className="flex flex-col flex-1 min-h-0 overflow-hidden">
                        <ScrollArea
                          className="flex-1"
                          onScroll={(event) => {
                            const target = event.currentTarget
                            const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 100
                            setUserScrolledExecutionLog(!isAtBottom)
                          }}
                        >
                          <div className="p-4">
                            {executionLog.length === 0 && (
                              <div className={`text-muted-foreground`}>
                                No execution logs yet. Run the program to see output here.
                              </div>
                            )}
                            <ConsoleOutputRenderer executionLog={executionLog} />
                            <div ref={executionLogRef} className="h-4" />
                          </div>
                        </ScrollArea>
                      </CollapsibleContent>
                    </Collapsible>

                    {!showExecutionDetails &&
                      executionLog.length > 0 &&
                      executionLog[executionLog.length - 1].exit_code >= 0 && (
                        <div className="flex flex-1 items-center justify-center p-4">
                          {executionLog[executionLog.length - 1].exit_code === 0 ? (
                            <div className="inline-flex items-center gap-2 text-muted-foreground">
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                              Program executed successfully
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-2 text-muted-foreground">
                              <AlertCircle className="h-5 w-5 text-destructive" />
                              Program execution failed
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </>
        ) : (
          <div className="p-6 text-center w-full flex flex-col items-center justify-center h-full">
            <FileCode className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-medium mb-2">No Code Generated Yet</h3>
            <p className="text-muted-foreground max-w-md mb-4">
              Once the AI generates code for your analysis, it will appear here for you to review and run.
            </p>
            {!hasGenerationStarted && (
              <Button onClick={handleSolveTask} disabled={isGenerating || !taskInst} className="mt-4">
                Generate Analysis
                <ArrowBigRight className="ml-2 w-5 h-5" />
              </Button>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderResultsPanel = () => <InteractiveResultsPanel
    outputFiles={outputFiles}
    isProgramRunnable={codeFiles.length > 0}
    isBusy={isRunning || isGenerating}
    onRunProgram={() => handleRunProgram(codeFiles[selectedProgramIndex])}
  />

  const renderStandardTabs = () => (
    <Tabs
      value={mainTab}
      onValueChange={(val) => setMainTab(val as "reasoning" | "program" | "results")}
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

  const onPanelResize = useDebouncedCallback((panel: "reasoning" | "program" | "results", size: number) => {
    setPanelSizes((prev) => {
      const newSizes = [...prev]
      const index = newSizes.findIndex((p) => p.id === panel)
      if (index !== -1) {
        newSizes[index].size = size
      } else {
        newSizes.push({ id: panel, size })
      }
      return newSizes
    })
  }, 50) // 50ms debounce

  const renderMinimizedPanel = (panel: "reasoning" | "program" | "results") => {
    const title =
      panel === "reasoning" ? "Reasoning Process" : panel === "program" ? "Generated Program" : "Execution Results"
    const icon =
      panel === "reasoning" ? (
        <MessageSquare className="h-4 w-4 mb-2" />
      ) : panel === "program" ? (
        <FileCode className="h-4 w-4 mb-2" />
      ) : (
        <BarChart className="h-4 w-4 mb-2" />
      )

    return (
      <div
        className="h-full w-10 border-r border-border flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => togglePanelMinimize(panel)}
      >
        <div className="flex flex-col items-center">
          {icon}
          <span className="text-xs whitespace-nowrap transform rotate-90 origin-center translate-y-0">{title}</span>
        </div>
      </div>
    )
  }

  const renderResizablePanels = () => (
    <div className="flex-1 flex h-full">
      <div className="flex h-full w-full">
        {minimizedPanels.length > 0 && (
          <div className="flex h-full">{minimizedPanels.map((panel) => renderMinimizedPanel(panel))}</div>
        )}

        <ResizablePanelGroup
          key={visiblePanels.join("-")}
          direction="horizontal"
          className="h-full w-full transition-none"
          onLayout={(sizes) => {
            // Only update panel sizes when user manually resizes, not on initial layout
            if (!isDragging && !isRunning) {
              sizes.forEach((size, index) => {
                if (index < visiblePanels.length) {
                  onPanelResize(visiblePanels[index], size)
                }
              })
            }
          }}
        >
          {visiblePanels.map((panel, index) => (
            <React.Fragment key={panel}>
              {index > 0 && (
                <ResizableHandle
                  withHandle
                  style={{
                    touchAction: "none", // Improve touch handling
                    transition: "none", // Disable transitions for the handle
                  }}
                />
              )}
              <ResizablePanel
                id={panel}
                defaultSize={getPanelSize(panel)}
                minSize={20}
                onResize={(size) => onPanelResize(panel, size)}
                style={{ transition: "none", willChange: "width" }} 
                className={`${draggedPanel === panel ? "scale-[0.98] shadow-xl ring-2 ring-primary/30 opacity-90 z-50" : ""
                  }`}
                ref={(el) => {
                  panelRefs.current[panel] = el
                }}
                onDragOver={(e) => handleDragOver(e, panel)}
                onDrop={(e) => handleDrop(e, panel)}
              >
                <div
                  className={`flex flex-col h-full border-r border-border ${draggedPanel === panel ? "bg-background/95 backdrop-blur-sm" : ""
                    } ${dragOverPanel === panel ? "panel-drop-target" : ""}`}
                  style={{ transition: "none" }} // Disable transitions for the panel content
                >
                  {/* Panel header with enhanced drag styling */}
                  <div
                    className={`flex items-center justify-between border-b border-border h-12 px-3 bg-muted/30 cursor-move
                      ${draggedPanel === panel ? "opacity-90 bg-primary/5" : ""}
                      ${dragOverPanel === panel ? "bg-muted/70" : ""}`}
                    draggable={true}
                    onDragStart={(e) => handleDragStart(panel, e)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="flex items-center gap-2 h-full font-medium text-base">
                      <div className="p-1 hover:bg-muted/50 rounded">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                      </div>
                      {panel === "reasoning" ? (
                        <MessageSquare className="h-5 w-5 text-primary" />
                      ) : panel === "program" ? (
                        <FileCode className="h-5 w-5 text-primary" />
                      ) : (
                        <BarChart className="h-5 w-5 text-primary" />
                      )}
                      <span>
                        {panel === "reasoning"
                          ? "Reasoning Process"
                          : panel === "program"
                            ? "Generated Program"
                            : "Execution Results"}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        togglePanelMinimize(panel)
                      }}
                    >
                      <Minimize2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex-1 overflow-hidden" key={`${panel}-content`}>
                    {panel === "reasoning" && renderReasoningPanel()}
                    {panel === "program" && renderProgramPanel()}
                    {panel === "results" && renderResultsPanel()}
                  </div>
                </div>
              </ResizablePanel>
            </React.Fragment>
          ))}

          {visiblePanels.length === 0 && (
            <div className="flex items-center justify-center w-full h-full text-muted-foreground">
              <div className="text-center">
                <p>All panels are minimized</p>
                <p className="text-sm mt-2">Click on a minimized panel to restore it</p>
              </div>
            </div>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  )

  useEffect(() => {
    if (agentSession) {
      // Update visible panels when code is generated or execution happens
      const shouldShowProgramPanel =
        codeFiles.length > 0 &&
        !(codeFiles.length === 1 && codeFiles[0].is_gold) &&
        !visiblePanels.includes("program") &&
        !minimizedPanels.includes("program")

      if (shouldShowProgramPanel) {
        setVisiblePanels((prev) => {
          const newPanels = [...prev]
          const reasoningIndex = newPanels.indexOf("reasoning")
          if (!newPanels.includes("program")) {
            if (reasoningIndex !== -1) {
              newPanels.splice(reasoningIndex + 1, 0, "program")
            } else {
              newPanels.push("program")
            }
          }
          return newPanels
        })
      }

      // Update visible panels when execution happens - only show results when there are output files
      // But don't add it automatically through this effect - let the run button handle it

      // Remove results panel when there are no output files
      if (outputFiles.length === 0 && visiblePanels.includes("results")) {
        setVisiblePanels((prev) => {
          // Store the current sizes before removing the panel
          const resultsPanel = panelSizes.find((p) => p.id === "results")
          const resultsPanelSize = resultsPanel?.size || 0

          // Get remaining panels
          const remainingPanels = prev.filter((p) => p !== "results")

          // If we have remaining panels, redistribute the size
          if (remainingPanels.length > 0 && resultsPanelSize > 0) {
            // Calculate how much to add to each remaining panel
            const sizeAddPerPanel = resultsPanelSize / remainingPanels.length

            setPanelSizes((current) => {
              const updatedSizes = [...current]

              // Add size to remaining panels
              remainingPanels.forEach((panelId) => {
                const panelIndex = updatedSizes.findIndex((p) => p.id === panelId)
                if (panelIndex !== -1) {
                  updatedSizes[panelIndex] = {
                    ...updatedSizes[panelIndex],
                    size: updatedSizes[panelIndex].size + sizeAddPerPanel,
                  }
                }
              })

              return updatedSizes
            })
          }

          return remainingPanels
        })

        if (activePanel === "results") {
          setActivePanel(visiblePanels.filter((p) => p !== "results")[0] || "reasoning")
        }
      }
    }
  }, [agentSession, codeFiles, visiblePanels, minimizedPanels, useResizableTabs, outputFiles, activePanel, panelSizes])

  // Show the results panel whenever output files exist
  useEffect(() => {
    if (outputFiles.length > 0) {
      // For resizable tabs mode
      if (useResizableTabs) {
        // Add results panel if it's not already visible or minimized
        if (!visiblePanels.includes("results") && !minimizedPanels.includes("results")) {
          setVisiblePanels((prev) => {
            // Calculate the total size of current panels
            const totalCurrentSize = prev.reduce((sum, panelId) => {
              const panel = panelSizes.find((p) => p.id === panelId)
              return sum + (panel?.size || 33)
            }, 0)

            // If there are existing panels, adjust their sizes proportionally
            if (prev.length > 0 && totalCurrentSize > 0) {
              const scaleFactor = 100 / (totalCurrentSize + 33) // +33 for the new panel

              // Update sizes of existing panels
              setPanelSizes((current) => {
                const updatedSizes = [...current]

                // Scale down existing visible panels
                prev.forEach((panelId) => {
                  const panelIndex = updatedSizes.findIndex((p) => p.id === panelId)
                  if (panelIndex !== -1) {
                    updatedSizes[panelIndex] = {
                      ...updatedSizes[panelIndex],
                      size: updatedSizes[panelIndex].size * scaleFactor,
                    }
                  }
                })

                // Make sure results panel has a size
                const resultsIndex = updatedSizes.findIndex((p) => p.id === "results")
                if (resultsIndex !== -1)
                  if (resultsIndex !== -1) {
                    updatedSizes[resultsIndex] = { id: "results", size: 33 * scaleFactor }
                  } else {
                    updatedSizes.push({ id: "results", size: 33 * scaleFactor })
                  }

                return updatedSizes
              })
            }

            return [...prev, "results"]
          })
        }
      } else {
        // For standard tabs mode, just switch to results tab if we're running a program
        if (isRunning) {
          setMainTab("results")
        }
      }
    }
  }, [outputFiles, visiblePanels, minimizedPanels, panelSizes, useResizableTabs, isRunning])

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
        {isSidebarOpen ? <SidebarClose className="!h-6 !w-6" /> : <SidebarOpen className="!h-6 !w-6" />}
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
          <div className="flex justify-center mt-4 mb-2">
            <Link to="/gallery">
              <Button variant="outline" size="icon" className="relative group">
                <Columns className="w-5 h-5" />
                <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap">
                  Gallery
                </span>
              </Button>
            </Link>
          </div>
        )}

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

                  {hasGenerationStarted && <AlertDialog>
                    <AlertDialogTrigger disabled={isGenerating} className="w-full">
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

                  {!hasGenerationStarted && 
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
        {!hasGenerationStarted && <WorkflowStepsIndicator currentStep={currentStep}/>}
        {useResizableTabs ? renderResizablePanels() : renderStandardTabs()}
      </div>

      <HelpModal />
    </div>
  )
}

export default Execution
