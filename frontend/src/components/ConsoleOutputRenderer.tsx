import React from "react"
import { Button } from "@/components/ui/button"
import { Terminal, CheckCircle2, AlertCircle, MessageSquare } from "lucide-react"
import { toast } from "sonner"
import { type ExecutionLogEntry } from "../api/api"
import { AnsiUp } from "ansi_up"

interface ConsoleOutputRendererProps {
  executionLog: ExecutionLogEntry[]
  className?: string
}

const ansiUp = new AnsiUp()

function parseOutput(text: string): string {
    const lines = text.split('\n').map(line => {
        const parts = line.split('\r')
        // Keep only the last part after carriage returns
        return parts[parts.length - 1]
    })
    const processedText = lines.join('\n')
    const html = ansiUp.ansi_to_html(processedText)
    return html
}

export const ConsoleOutputRenderer: React.FC<ConsoleOutputRendererProps> = ({
  executionLog,
  className = "",
}) => {
  const handleAddToChat = (entry: ExecutionLogEntry) => {
    const chatInput = document.getElementById("chat-input") as HTMLInputElement
    if (chatInput) {
      const logMessage = [
        `\`\`\`
Command: ${entry.command.join(" ")}
Output: ${entry.output}
Exit Code: ${entry.exit_code}
\`\`\``,
      ].join("\n")
      chatInput.value = chatInput.value
        ? `${chatInput.value}\n\n${logMessage}`
        : logMessage
      chatInput.focus()
    }
    toast("Log added to chat input")
  }

  return (
    <div className={className}>
      {executionLog.map((entry, idx) => (
        <div key={idx} className="mb-3 grid grid-cols-1 relative group last:mb-0">
          <div className="p-3 bg-muted/20 rounded-lg whitespace-pre-wrap font-mono w-full min-w-0 border border-border">
            <p className="text-primary font-bold mb-1 flex items-center gap-2 text-sm">
              {entry.exit_code !== -1 ?
                <Terminal className="h-4 w-4"/> :
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-primary"></div>}
              {entry.tag === "run" && `${entry.command.at(-1)}`}
              {entry.tag === "install" && "Installing dependencies: " + entry.command[0]}
              {/*entry.command.join(" ")*/}
            </p>
            <p className="text-sm" dangerouslySetInnerHTML={{ __html: parseOutput(entry.output) }}></p>
            {entry.exit_code >= 0 && (
              <p className="font-bold mt-2 flex items-center gap-2 text-sm">
                {entry.exit_code === 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
                Process exited with code: {entry.exit_code}
              </p>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-90 transition-opacity duration-200 flex items-center gap-1"
            onClick={(e) => {
              e.stopPropagation()
              handleAddToChat(entry)
            }}
          >
            <MessageSquare className="h-4 w-4" />
            Add to chat
          </Button>
        </div>
      ))}
    </div>
  )
}