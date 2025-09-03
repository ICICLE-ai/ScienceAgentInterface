import React, { useRef, useState, useEffect } from "react"
import { useDebouncedCallback } from "use-debounce"
import { Button } from "@/components/ui/button"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import { type ImperativePanelGroupHandle, type ImperativePanelHandle } from "react-resizable-panels"
import { GripVertical, Minimize2 } from "lucide-react"
import { throttle } from "@/lib/utils"

interface ResizablePanelsProps {
  panels: Record<string, { title: string; icon: React.ReactNode, render: () => React.ReactNode, defaultSize: number }>
  isRunning: boolean
  activatedPanels: string[] // Set of activated panels
}

export const ResizablePanels: React.FC<ResizablePanelsProps> = ({
  panels,
  isRunning,
  activatedPanels,
}) => {
  const panelRefs = useRef<Record<string, ImperativePanelHandle | null>>({})
  const panelGroupRef = useRef<ImperativePanelGroupHandle | null>(null)
  const outerDivRef = useRef<HTMLDivElement>(null)
  
  // Drag state
  const [draggedPanel, setDraggedPanel] = useState<string | null>(null)
  const [dragOverPanel, setDragOverPanel] = useState<string | null>(null)
  const [draggedPanelRect, setDraggedPanelRect] = useState<DOMRect | null>(null)
  const [isDragging, setIsDragging] = useState<boolean>(false)

  // Panel state
  const [panelSizes, setPanelSizes] = useState<Record<string, number>>({})
  const [visiblePanels, setVisiblePanels] = useState<string[]>([])
  const [collapsedPanels, setCollapsedPanels] = useState<Record<string, boolean>>({})

  let modifiedPanels = false;
  for (const panel in panels) {
    // Initialize panels activated for the first time
    if (activatedPanels.includes(panel) && !visiblePanels.includes(panel)) {
      modifiedPanels = true

      // Calculate the total size of current panels
      const totalCurrentSize = visiblePanels.reduce((sum, panelId) => sum + panelSizes[panelId], 0) || 0

      // If there are existing panels, adjust their sizes proportionally
      visiblePanels.forEach((panelId) => {
        const scaleFactor = (totalCurrentSize - panels[panel].defaultSize) / totalCurrentSize || 1
        panelSizes[panelId] *= scaleFactor
      })

      panelSizes[panel] = visiblePanels.length > 0 ? panels[panel].defaultSize : 100

      const panelNames = Object.keys(panels)
      const insertAfterIdx = panelNames.indexOf(panel) - 1
      visiblePanels.splice(insertAfterIdx + 1, 0, panel)
    }
    else if (!activatedPanels.includes(panel) && (visiblePanels.includes(panel))) {
      modifiedPanels = true

      if (visiblePanels.includes(panel)) {
        visiblePanels.splice(visiblePanels.indexOf(panel), 1)

        // If we have remaining panels, redistribute the size
        const resultsPanelSize = panelSizes[panel]
        if (resultsPanelSize > 0 && visiblePanels.length > 0) {
          // Calculate how much to add to each remaining panel
          const sizeAddPerPanel = resultsPanelSize / visiblePanels.length
          delete panelSizes[panel]
          visiblePanels.forEach((panelId) => {
            panelSizes[panelId] += sizeAddPerPanel
          })
        }
      }
    }
  }
  if (modifiedPanels) {
    setTimeout(() => {
      panelGroupRef.current?.setLayout(visiblePanels.map((panel) => panelSizes[panel]))
    }, 1)
    setVisiblePanels([...visiblePanels])
    setPanelSizes({ ...panelSizes })
  }

  const getCollapsedSize = () => {
    const pixelWidth = 42 // Default collapsed width in pixels
    const container = outerDivRef.current
    if (container && container.offsetWidth > 0) {
      return (pixelWidth / container.offsetWidth) * 100
    }
    return 2.5
  }

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

  const onPanelResize = useDebouncedCallback((panel: string, size: number) => {
    setPanelSizes((prev) => ({ ...prev, [panel]: size }))
  }, 50) // 50ms debounce

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

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      updateGhostPosition(e)
    }

    window.addEventListener("mousemove", handleMouseMove)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
    }
  }, [isDragging, draggedPanelRect])

  // Handle drag start for panel reordering
  const handleDragStart = (panel: string, e: React.DragEvent) => {
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
      title.textContent = panels[panel]?.title || panel
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

  // Handle drag over for panel reordering
  const handleDragOver = (e: React.DragEvent, panel: string) => {
    if (Array.from(e.dataTransfer.types).includes("Files")) return // Lets you drag files normally

    e.preventDefault()
    e.stopPropagation()

    if (draggedPanel && draggedPanel !== panel) {
      setDragOverPanel(panel)

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
  const handleDrop = (e: React.DragEvent, targetPanel: string) => {
    if (Array.from(e.dataTransfer.types).includes("Files")) return // Lets you drop files normally

    e.preventDefault()
    e.stopPropagation()

    // Clean up drag visual elements
    cleanupDragVisuals()

    if (draggedPanel && draggedPanel !== targetPanel) {
      // Swap panel positions
      const newPanels = [...visiblePanels]
      const draggedIndex = newPanels.indexOf(draggedPanel)
      const targetIndex = newPanels.indexOf(targetPanel)

      if (draggedIndex !== -1 && targetIndex !== -1) {
        [newPanels[draggedIndex], newPanels[targetIndex]] = [newPanels[targetIndex], newPanels[draggedIndex]]
        setVisiblePanels(newPanels)
      }
    }
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

  // Update the ghost panel position during drag using requestAnimationFrame
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
  }, [])

  const renderMinimizedPanel = (panel: string) => {
    const panelInfo = panels[panel]
    if (!panelInfo) return null

    return (
      <div
        key={panel}
        className="h-full w-10 border-r border-border flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => {
          panelRefs.current[panel]?.expand()
          setCollapsedPanels((prev) => ({ ...prev, [panel]: false }))
        }}
      >
        <div className="flex flex-col items-center gap-12">
          <div className="mb-2">{panelInfo.icon}</div>
          <span className="text-xs whitespace-nowrap transform rotate-90 origin-center translate-y-0">
            {panelInfo.title}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full" ref={outerDivRef}>
      <ResizablePanelGroup
        key={visiblePanels.join("-")}
        direction="horizontal"
        className="h-full w-full transition-none"
        ref={panelGroupRef}
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
              defaultSize={panelSizes[panel]}
              collapsible={true}
              collapsedSize={getCollapsedSize()}
              minSize={20}
              onCollapse={() => setCollapsedPanels((prev) => ({ ...prev, [panel]: true }))}
              onExpand={() => setCollapsedPanels((prev) => ({ ...prev, [panel]: false }))}
              onResize={(size) => onPanelResize(panel, size)}
              style={{ transition: "none", willChange: "width" }}
              className={`${
                draggedPanel === panel ? "scale-[0.98] shadow-xl ring-2 ring-primary/30 opacity-90 z-50" : ""
              }`}
              ref={(el) => {
                panelRefs.current[panel] = el
              }}
              onDragOver={(e) => handleDragOver(e, panel)}
              onDrop={(e) => handleDrop(e, panel)}
            >
              <div
                className={`flex flex-col h-full border-r border-border ${
                  draggedPanel === panel ? "bg-background/95 backdrop-blur-sm" : ""
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
                  onDragEnd={cleanupDragVisuals}
                >
                  <div className="flex items-center gap-2 h-full font-medium text-base">
                    <div className="p-1 hover:bg-muted/50 rounded">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                    </div>
                    {panels[panel]?.icon}
                    <span>{panels[panel]?.title}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      panelRefs.current[panel]?.collapse()
                      setCollapsedPanels((prev) => ({ ...prev, [panel]: true }))
                    }}
                  >
                    <Minimize2 className="h-4 w-4" />
                  </Button>
                </div>
                { collapsedPanels[panel] ? (renderMinimizedPanel(panel)) : (
                  <div className="flex-1 overflow-hidden" key={`${panel}-content`}>
                    {panels[panel]?.render()}
                  </div>
                )}
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
  )
}