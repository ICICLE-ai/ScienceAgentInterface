"use client"

import React from "react"
import { useState, useRef, useEffect } from "react"
import {
  Terminal,
  Download,
  Play,
  Copy,
  Undo2,
  ChevronDown,
  FileDiff,
  AlertCircle,
  CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import Editor, { useMonaco, DiffEditor } from "@monaco-editor/react"
import { downloadText, rgbToHex, scrollIntoView } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ConsoleOutputRenderer } from "@/components/ConsoleOutputRenderer"
import { useTheme } from "@/providers/ThemeProvider"
import type { CodeFile, ExecutionLogEntry } from "../../api/api"

interface CodeEditorPanelProps {
  codeFiles: CodeFile[]
  selectedProgramIndex: number
  isDiffViewActive: boolean
  isRunning: boolean
  isGenerating: boolean
  executionLog: ExecutionLogEntry[]
  onSelectedProgramIndexChange: (index: number) => void
  onDiffViewActiveChange: (active: boolean) => void
  onRunProgram: (codeFile: CodeFile) => void
  onProgramContentChange: (content: string, codeFile: CodeFile) => void
  onExecutionLogClear: () => void
}

export const CodeEditorPanel: React.FC<CodeEditorPanelProps> = ({
  codeFiles,
  selectedProgramIndex,
  isDiffViewActive,
  isRunning,
  isGenerating,
  executionLog,
  onSelectedProgramIndexChange,
  onDiffViewActiveChange,
  onRunProgram,
  onProgramContentChange,
  onExecutionLogClear,
}) => {
  const [editorHeight, setEditorHeight] = useState<number>(70)
  const [consoleHeight, setConsoleHeight] = useState<number>(30)
  const executionLogRef = useRef<HTMLDivElement>(null)
  const [userScrolledExecutionLog, setUserScrolledExecutionLog] = useState<boolean>(false)
  const [showExecutionDetails, setShowExecutionDetails] = useState<boolean>(true)
  const [compareVersionIndex, setCompareVersionIndex] = useState<number>(0)

  const monaco = useMonaco()
  const { theme, savedTheme } = useTheme()

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

  useEffect(() => scrollIntoView(false, executionLogRef), [executionLog])

  const editorOptions = {
    minimap: { enabled: false },
    fontSize: 14,
    lineHeight: 1.4,
    padding: { top: 16, bottom: 16 },
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Program Header / Version Controls */}
      <div className="w-full pl-6 border-b border-border py-3 bg-muted/30">
        <div className="flex gap-3 items-center">
          <Button
            variant="default"
            onClick={() => onRunProgram(codeFiles[selectedProgramIndex])}
            disabled={isRunning || isGenerating}
            className="gap-2"
          >
            <Play className="h-4 w-4" /> Run
          </Button>

          <div className="w-40">
            <Select
              onValueChange={(val) => onSelectedProgramIndexChange(Number.parseInt(val))}
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
                  onDiffViewActiveChange(!isDiffViewActive)
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
                  const model = monaco?.editor.getModel(monaco.Uri.parse(codeFiles[selectedProgramIndex].filename))
                  if (model) {
                    // Replace the content with the initial generated code as an undoable operation
                    model.pushEditOperations([], [{
                      range: model.getFullModelRange(),
                      text: codeFiles[selectedProgramIndex].content
                    }], () => null)
                    codeFiles[selectedProgramIndex].user_content = codeFiles[selectedProgramIndex].content
                    onProgramContentChange(codeFiles[selectedProgramIndex].content, codeFiles[selectedProgramIndex])
                    toast("Code reverted to initial generated version.")
                  }
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
              {isDiffViewActive ? (
                <DiffEditor
                  key="diff-editor"
                  language="python"
                  original={codeFiles[compareVersionIndex]?.user_content || ""}
                  modified={codeFiles[selectedProgramIndex]?.user_content || ""}
                  theme="custom-theme"
                  options={{ ...editorOptions, readOnly: true }}
                  className="w-full h-full"
                />
              ) : (
                <Editor
                  key="editor"
                  defaultLanguage="python"
                  defaultValue={codeFiles[selectedProgramIndex]?.user_content || ""}
                  path={codeFiles[selectedProgramIndex].filename}
                  theme="custom-theme"
                  options={editorOptions}
                  className="w-full h-full"
                  onChange={(value) => {
                    if (value) {
                      const codeFile = codeFiles[selectedProgramIndex]
                      // Don't need to update the state here, because the Monaco editor already has this update
                      codeFile.user_content = value
                      onProgramContentChange(codeFile.user_content, codeFile)
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
            onResize={setConsoleHeight}
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
                      onClick={onExecutionLogClear}
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
    </div>
  )
}