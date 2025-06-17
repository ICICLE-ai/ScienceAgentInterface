import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { FileCode, Copy, ChevronDown, ChevronUp } from "lucide-react"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { dracula as darkCodeTheme, prism as lightCodeTheme } from "react-syntax-highlighter/dist/esm/styles/prism"
import { toast } from "sonner"
import { useTheme } from "@/components/theme-provider"
import type { CodeFile } from "../api/api"


interface CodeBlockRendererProps {
  showToolbar?: boolean
  content: string
  codeFile?: CodeFile
  isLoading?: boolean
  onOpenInEditor: () => void
}

export const CodeBlockRenderer: React.FC<CodeBlockRendererProps> = ({
  showToolbar,
  content,
  codeFile,
  isLoading,
  onOpenInEditor,
}) => {
  const { theme } = useTheme()
  const [isExpanded, setIsExpanded] = useState(false)

  const handleCopyCode = () => {
    navigator.clipboard.writeText(content)
    toast("Code copied to clipboard!")
  }

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded)
  }

  return (
    <div className={`my-3 ${!showToolbar ? "border-border border-y-2" : ""} ${showToolbar && isExpanded ? "border-border border-b-2" : ""}`}>
      {showToolbar && (
        <div className="flex items-center p-1 pl-4 bg-muted w-full h-8 rounded-lg border-border border-y-2">
          <Button
            variant={"ghost"}
            size={"sm"}
            className="!p-1 mr-2"
            onClick={toggleExpanded}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          {codeFile && (
            <div className="flex flex-row text-xs font-mono cursor-pointer" onClick={toggleExpanded}>
              <FileCode className="h-4 w-4 mr-1" />
              {codeFile.filename}
            </div>
          )}
          {isLoading && (<>
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-primary"></div>
              <div className="text-xs ml-2 font-mono">Generating code...</div>
            </>
          )}

          <div className="grow" />

          {codeFile && (
            <Button
              variant={"ghost"}
              size={"sm"}
              className="!p-2"
              onClick={() => onOpenInEditor()}
            >
              Open in Editor
            </Button>
          )}
          <Button
            variant={"ghost"}
            size={"sm"}
            className="!p-2"
            onClick={handleCopyCode}
          >
            <Copy /> Copy
          </Button>
        </div>
      )}
      {isExpanded && (
        <div className="grid grid-cols-1">
          <ScrollArea className="max-h-[36rem]">
            <SyntaxHighlighter
              language="python"
              style={theme === "dark" ? darkCodeTheme : lightCodeTheme}
              showLineNumbers
              customStyle={{ background: "hsl(var(--background))", fontSize: "14px" }}
            >
              {content}
            </SyntaxHighlighter>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      )}
    </div>
  )
}