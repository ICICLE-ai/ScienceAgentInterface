"use client"

import { useState, useMemo, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import TaskCard from "../components/tasks/TaskCard"
import { getDomainColor } from "../lib/utils"
import { ChevronDownIcon, SearchIcon, FilterIcon, PlusIcon, GridIcon, ListIcon } from "../components/icons"
import { ThemeToggle } from "../components/theme-toggle"
import { type AgentSession, createAgentSession, fetchTask, fetchTasks } from "../api/api"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Home } from "lucide-react"

const TaskGallery = () => {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<AgentSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set())
  const [showDomainFilter, setShowDomainFilter] = useState(false)
  const [activeTab, setActiveTab] = useState("community")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

  useEffect(() => {
    const loadTasks = async () => {
      try {
        setLoading(true)
        const tasks = await fetchTasks()
        const savedSessionIDs = JSON.parse(localStorage.getItem("savedSessionIDs") || "[]")
        const userTasks = await Promise.all(savedSessionIDs.map(async (sessionID: string) => fetchTask(sessionID)))
        setTasks([...tasks, ...userTasks])
      } catch (err) {
        console.error("Error fetching tasks:", err)
        setError("Failed to load tasks. Please try again later.")
      } finally {
        setLoading(false)
      }
    }

    loadTasks()
  }, [])

  // Tasks for each tab ('current', 'community')
  const tabFilteredTasks = useMemo(
    () =>
      tasks.filter((task) =>
        task?.metadata?.source && (activeTab === "current" ? task.metadata.source === "user" : task.metadata.source === "benchmark"),
      ),
    [tasks, activeTab],
  )

  // The domains for each set of tasks
  const availableDomains = useMemo(
    () => [...new Set(tabFilteredTasks.map((task) => task.metadata.domain))].filter(Boolean),
    [tabFilteredTasks],
  )

  // Displays tasks that match the filters (Search, Domain Filter)
  const filteredTasks = useMemo(() => {
    let filtered = tabFilteredTasks.filter((task) => {
      const taskInst = task.task_instruction ? task.task_instruction.toLowerCase() : ""
      const taskDomain = task.metadata.domain ? task.metadata.domain.toLowerCase() : ""
      const taskName = task.description ? task.description.toLowerCase() : ""

      const matchesSearch =
        taskInst.includes(searchQuery.toLowerCase()) ||
        taskDomain.includes(searchQuery.toLowerCase()) ||
        taskName.includes(searchQuery.toLowerCase())

      const matchesDomain =
        selectedDomains.size === 0 || (task.metadata.domain && selectedDomains.has(task.metadata.domain))

      return matchesSearch && matchesDomain
    })

   

    return filtered
  }, [tabFilteredTasks, searchQuery, selectedDomains])

  const toggleDomain = (domain: string) => {
    setSelectedDomains((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(domain)) {
        newSet.delete(domain)
      } else {
        newSet.add(domain)
      }
      return newSet
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen flex-row gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-foreground"></div>
        <div className="font-bold">Loading tasks...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-20 p-6 bg-card rounded-lg shadow-md border border-border">
        <h3 className="text-xl font-bold text-destructive mb-3">Error</h3>
        <p className="text-card-foreground">{error}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header with title, home button, and theme toggle */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full hover:bg-muted transition-colors"
              onClick={() => navigate("/")}
              aria-label="Back to Home"
            >
              <Home className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Tabs and filters section */}
        <div className="bg-card rounded-xl shadow-md border border-border mb-8">
          {/* Tabs */}
          <div className="border-b border-border">
            <div className="flex">
              <button
                className={`py-4 px-6 font-medium text-sm transition-colors duration-200 relative ${
                  activeTab === "current" ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => {
                  setActiveTab("current")
                  setSelectedDomains(new Set())
                  setShowDomainFilter(false)
                }}
              >
                My Tasks
                {activeTab === "current" && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary"></span>}
              </button>
              <button
                className={`py-4 px-6 font-medium text-sm transition-colors duration-200 relative ${
                  activeTab === "community" ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => {
                  setActiveTab("community")
                  setSelectedDomains(new Set())
                  setShowDomainFilter(false)
                }}
              >
                Community Tasks
                {activeTab === "community" && (
                  <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary"></span>
                )}
              </button>
            </div>
          </div>

          {/* Search and filters */}
          <div className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search input */}
              <div className="relative flex-grow">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <SearchIcon className="h-5 w-5 text-muted-foreground" />
                </div>
                <input
                  type="text"
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 w-full border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:border-input"
                />
              </div>

              {/* View mode toggle */}
              <div className="flex items-center space-x-2 bg-muted rounded-lg p-1">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-2 rounded-md ${
                    viewMode === "grid"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <GridIcon className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-2 rounded-md ${
                    viewMode === "list"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ListIcon className="h-5 w-5" />
                </button>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center justify-between px-4 py-2 bg-background border border-input rounded-lg text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-200">
                  <div className="flex items-center w-28">
                    <FilterIcon className="h-4 w-4 mr-2" />
                    <span>Domains {selectedDomains.size > 0 ? `(${selectedDomains.size})` : ""}</span>
                  </div>
                  <ChevronDownIcon className="h-4 w-4 ml-2" />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Filter by Domain</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {availableDomains
                    .filter((d): d is string => d !== undefined)
                    .map((domain) => (
                      <DropdownMenuCheckboxItem
                        key={domain}
                        checked={selectedDomains.has(domain)}
                        className="flex justify-between"
                        onClick={(e) => {
                          toggleDomain(domain)
                          e.preventDefault()
                          e.stopPropagation()
                        }}
                      >
                        <div className="flex items-center">
                          <div
                            className="w-3 min-w-3 max-w-3 h-3 rounded-full mr-3"
                            style={{ backgroundColor: getDomainColor(domain) }}
                          ></div>
                          <span>{domain}</span>
                        </div>
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-muted text-muted-foreground ml-2">
                          {tasks.filter((task) => task.metadata.domain === domain).length}
                        </span>
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Task count and results */}
        <div className="mb-4 text-sm text-muted-foreground">
          Showing {filteredTasks.length} {filteredTasks.length === 1 ? "task" : "tasks"}
          {selectedDomains.size > 0 && (
            <span>
              {" "}
              in {selectedDomains.size} {selectedDomains.size === 1 ? "domain" : "domains"}
            </span>
          )}
        </div>

        {/* Task grid or list */}
        {viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onClick={() => {
                  if (task.metadata.source === "user") {
                    localStorage.setItem("agentSessionId", task.id)
                    navigate("/")
                  } else {
                    navigate(`/tasks/${task.id}`)
                  }
                }}
              />
            ))}

            {filteredTasks.length === 0 && (
              <div className="col-span-1 md:col-span-2 lg:col-span-3 p-10 bg-card rounded-lg text-center shadow-md border border-border">
                <p className="text-muted-foreground">No tasks found matching your criteria.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className="bg-card rounded-lg shadow-sm border border-border p-4 hover:shadow-md transition-all cursor-pointer"
                onClick={() => navigate(`/tasks/${task.id}`)}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-2 h-full min-h-[60px] rounded-full flex-shrink-0"
                    style={{ backgroundColor: getDomainColor(task.metadata.domain) }}
                  ></div>
                  <div className="flex-grow">
                    <div className="flex items-center mb-2">
                      <span
                        className="inline-block px-2 py-0.5 text-xs font-medium rounded-full"
                        style={{
                          backgroundColor: `${getDomainColor(task.metadata.domain)}20`,
                          color: getDomainColor(task.metadata.domain),
                        }}
                      >
                        {task.metadata.domain || "Uncategorized"}
                      </span>
                    </div>
                    <h3 className="font-semibold text-lg mb-1 text-card-foreground">
                      {task.description ||
                        (task.task_instruction ? task.task_instruction.split(". ")[0] : "Untitled Task")}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {task.task_instruction
                        ? task.task_instruction.length > 150
                          ? task.task_instruction.substring(0, 150) + "..."
                          : task.task_instruction
                        : "No description available"}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {filteredTasks.length === 0 && (
              <div className="p-10 bg-card rounded-lg text-center shadow-md border border-border">
                <p className="text-muted-foreground">No tasks found matching your criteria.</p>
              </div>
            )}
          </div>
        )}

        {/* Create task button */}
        {activeTab === "current" && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={() => {
                createAgentSession().then((res) => {
                  localStorage.setItem("agentSessionId", res["agent_session_id"])
                  const savedSessionIDs = JSON.parse(localStorage.getItem("savedSessionIDs") || "[]")
                  localStorage.setItem("savedSessionIDs", JSON.stringify([...savedSessionIDs, res["agent_session_id"]]))
                  navigate("/")
                })
              }}
              className="flex items-center px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg shadow-md transition-all duration-200 hover:shadow-lg hover:-translate-y-1"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              New Task
            </button>
          </div>
        )}
      </main>

      {/* Fixed navigation button for smaller screens */}
      <div className="md:hidden fixed bottom-6 right-6">
        <Button size="lg" className="rounded-full shadow-lg" onClick={() => navigate("/")} aria-label="Back to Home">
          <Home className="h-5 w-5 mr-2" />
          Home
        </Button>
      </div>
    </div>
  )
}

export default TaskGallery
