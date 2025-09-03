"use client"

import { useState, useEffect } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { fetchTask, AgentSession } from "../../api/api"
import { getDomainColor } from "../../lib/utils"
import { 
  ArrowLeftIcon, 
  ExternalLinkIcon, 
  DatabaseIcon, 
  CodeIcon, 
  PlayIcon,
  FileTextIcon,
  BookOpenIcon,
  GithubIcon
} from "../Icons"
import { ThemeToggle } from "../ThemeToggleButton"
import { createAgentSessionFromTask } from "../../api/api";
import MarkdownRenderer from "../MarkdownRenderer"

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  content: string
}

const Modal = ({ isOpen, onClose, title, content }: ModalProps) => {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-lg w-full max-w-4xl max-h-[80vh] flex flex-col shadow-lg border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-lg font-semibold text-card-foreground">{title}</h3>
          <button className="text-muted-foreground hover:text-foreground transition-colors" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="p-4 overflow-y-auto">
          <pre className="text-sm bg-muted p-4 rounded-md overflow-x-auto whitespace-pre-wrap text-muted-foreground">
            <code>{content}</code>
          </pre>
        </div>
      </div>
    </div>
  )
}

const TaskDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [task, setTask] = useState<AgentSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalContent, setModalContent] = useState({ title: "", content: "" })

  // Check if task was passed via location state
  useEffect(() => {
    if (location.state?.task) {
      setTask(location.state.task)
      setLoading(false)
      return
    }

    // Otherwise fetch task by ID
    if (id) {
      setLoading(true)
      fetchTask(id)
        .then((response) => {
          setTask(response) 
        })
        .catch((err) => {
          console.error("Error fetching task:", err)
          setError("Failed to load task details")
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [id, location.state])

  const handleTryItOut = async () => {
    setLoading(true);
    const res = await createAgentSessionFromTask(id!);
    if (!res || !res['agent_session_id']) {
      setError("Failed to create agent session. Please try again later.");
      setLoading(false);
      return;
    }
    localStorage.setItem('agentSessionId', res['agent_session_id']);
    const savedSessionIDs = JSON.parse(localStorage.getItem("savedSessionIDs") || "[]")
    localStorage.setItem("savedSessionIDs", JSON.stringify([...savedSessionIDs, res["agent_session_id"]]))
    navigate("/");
  }

  const openModal = (title: string, content: string) => {
    setModalContent({ title, content })
    setIsModalOpen(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen flex-row gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-foreground"></div>
        <div className="font-bold">Loading task details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-20 p-6 bg-card rounded-lg shadow-md border border-border">
        <h3 className="text-xl font-bold text-destructive mb-3">Error</h3>
        <p className="text-card-foreground">{error}</p>
        <button
          className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          onClick={() => navigate("/gallery")}
        >
          Back to Gallery
        </button>
      </div>
    )
  }

  if (!task) {
    return (
      <div className="max-w-md mx-auto mt-20 p-6 bg-card rounded-lg shadow-md border border-border">
        <h3 className="text-xl font-bold mb-3 text-card-foreground">Task Not Found</h3>
        <p className="text-muted-foreground">The requested task could not be found.</p>
        <button
          className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          onClick={() => navigate("/gallery")}
        >
          Back to Gallery
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Header with navigation and theme toggle */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <button
            className="flex items-center text-muted-foreground hover:text-primary transition-colors"
            onClick={() => navigate("/gallery")}
          >
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Back to Gallery
          </button>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 max-w-6xl">
        {/* Task title and domain */}
        <div className="mt-8 mb-10">
          <span
            className="inline-block px-3 py-1 rounded-full text-sm font-medium text-white mb-3"
            style={{ backgroundColor: getDomainColor(task.metadata.domain) }}
          >
            {task.metadata.domain || "No Domain Available"}
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
            {task.description || (task.task_instruction ? task.task_instruction.split(". ")[0] : "No Title Available")}
          </h1>
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left column - Task details */}
          <div className="lg:col-span-8 space-y-8">
            {/* Task instructions card */}
            <div className="bg-card rounded-xl shadow-md border border-border overflow-hidden">
              <div className="flex items-center border-b border-border p-4 bg-card/50">
                <FileTextIcon className="h-5 w-5 mr-3 text-primary" />
                <h2 className="text-xl font-semibold text-card-foreground">Task Instructions</h2>
              </div>
              <div className="p-6 max-h-[350px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                <p className="text-muted-foreground leading-relaxed">
                  <MarkdownRenderer content={task.task_instruction || "No Instructions Available"} />
                </p>
              </div>
            </div>

            {/* Domain knowledge card */}
            <div className="bg-card rounded-xl shadow-md border border-border overflow-hidden">
              <div className="flex items-center border-b border-border p-4 bg-card/50">
                <BookOpenIcon className="h-5 w-5 mr-3 text-primary" />
                <h2 className="text-xl font-semibold text-card-foreground">Domain Knowledge</h2>
              </div>
              <div className="p-6 max-h-[350px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                {task.domain_knowledge ? (
                  <p className="text-muted-foreground leading-relaxed">
                    <MarkdownRenderer content={task.domain_knowledge} />
                  </p>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <BookOpenIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground">No domain knowledge available for this task.</p>
                    <p className="text-sm text-muted-foreground/70 mt-2 max-w-md">
                      Domain-specific information would appear here when provided with the task.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Try it out button */}
            <div className="flex justify-center mt-8">
              <button
                onClick={handleTryItOut}
                className="flex items-center justify-center px-8 py-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg shadow-md transition-all duration-200 text-lg font-medium hover:shadow-lg hover:-translate-y-1"
              >
                <PlayIcon className="h-5 w-5 mr-3" />
                Try it out
              </button>
            </div>
          </div>

          {/* Right column - Repository information */}
          <div className="lg:col-span-4">
            {(task.metadata.github_name ||
              task.metadata.src_file_path ||
              task.metadata.output_filename ||
              task.metadata.dataset_preview ||
              task.metadata.dataset_folder_tree) && (
              <div className="bg-card rounded-xl shadow-md border border-border sticky top-24">
                <div className="flex items-center border-b border-border p-4 bg-card/50">
                  <GithubIcon className="h-5 w-5 mr-3 text-primary" />
                  <h2 className="text-xl font-semibold text-card-foreground">Repository Information</h2>
                </div>
                <div className="p-6 space-y-6">
                  {task.metadata.github_name && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground">Repository</h3>
                      <a
                        href={`https://github.com/${task.metadata.github_name}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center w-full px-4 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
                      >
                        <ExternalLinkIcon className="h-4 w-4 mr-2" />
                        View Original Repository
                      </a>
                    </div>
                  )}

                  {task.metadata.dataset_folder_tree && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground flex items-center">
                        <CodeIcon className="h-4 w-4 mr-2 text-muted-foreground/70" />
                        Dataset Structure
                      </h3>
                      <div className="bg-muted rounded-lg p-4 text-xs font-mono text-muted-foreground overflow-x-auto max-h-40 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                        <pre>{task.metadata.dataset_folder_tree}</pre>
                      </div>
                    </div>
                  )}

                  {task.metadata.src_file_path && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground flex items-center">
                        <CodeIcon className="h-4 w-4 mr-2 text-muted-foreground/70" />
                        Source File Path
                      </h3>
                      <div className="bg-muted rounded-lg p-3 flex items-center text-xs font-mono">
                        <code className="text-muted-foreground">{task.metadata.src_file_path}</code>
                      </div>
                    </div>
                  )}

                  {task.metadata.output_filename && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground flex items-center">
                        <CodeIcon className="h-4 w-4 mr-2 text-muted-foreground/70" />
                        Output File
                      </h3>
                      <div className="bg-muted rounded-lg p-3 flex items-center text-xs font-mono">
                        <code className="text-muted-foreground">{task.metadata.output_filename}</code>
                      </div>
                    </div>
                  )}

                  {task.metadata.dataset_preview && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground flex items-center">
                        <DatabaseIcon className="h-4 w-4 mr-2 text-muted-foreground/70" />
                        Dataset Preview
                      </h3>
                      <button
                        onClick={() => openModal("Dataset Preview", task.metadata.dataset_preview || "")}
                        className="flex items-center justify-center w-full px-4 py-3 bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-lg transition-colors"
                      >
                        <DatabaseIcon className="h-4 w-4 mr-2" />
                        View Dataset Preview
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={modalContent.title}
        content={modalContent.content}
      />
    </div>
  )
}

export default TaskDetail
