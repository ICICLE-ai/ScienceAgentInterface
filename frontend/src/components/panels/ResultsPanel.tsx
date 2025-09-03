import React from "react"
import { useMemo } from "react"
import { OutputFile } from "../../api/api"
import { Map, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { FileCard } from "../FileCard"


interface ResultsPanelProps {
  outputFiles: OutputFile[]
  isProgramRunnable: boolean
  isBusy: boolean
  onRunProgram?: () => void
}

export const ResultsPanel: React.FC<ResultsPanelProps> = ({ outputFiles, isProgramRunnable, isBusy, onRunProgram }) => {
  // Get file type from filename
  const getFileType = (filename: string): string => {
    const extension = filename.split(".").pop()?.toLowerCase() || ""
    return extension
  }

  // Filter and sort files
  const processedFiles = useMemo(() => {
    const filtered = outputFiles
    return [...filtered]
  }, [outputFiles])

  // Group files by type for better organization
  const filesByType = useMemo(() => {
    const groups: Record<string, OutputFile[]> = {}

    processedFiles.forEach((file) => {
      const type = getFileType(file.filename)
      if (!groups[type]) {
        groups[type] = []
      }
      groups[type].push(file)
    })

    return groups
  }, [processedFiles])

  return (
    <div className="flex flex-col h-full w-full">
      <ScrollArea className="flex-1 w-full">
        {outputFiles.length > 0 ? (
          <div className="p-4">
            {Object.entries(filesByType).map(([type, files]) => (
              <div key={type} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="outline" className="bg-primary/10 text-primary uppercase">
                    {type}
                  </Badge>
                  <span className="text-sm font-medium text-muted-foreground">
                    {files.length} file{files.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div
                  className="grid gap-4"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gridAutoRows: "auto",
                    gridAutoFlow: "row",
                  }}
                >
                  {files.map((file, idx) => (
                    <div key={idx} className="grid-item" style={{ height: "fit-content", alignSelf: "start" }}>
                      <FileCard file={file} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <Map className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-medium mb-2">No Results Yet</h3>
            <p className="text-muted-foreground max-w-md mb-4">
              Run your analysis to generate results. Maps, charts, and data files will appear here.
            </p>
            {isProgramRunnable && onRunProgram && (
              <Button
                onClick={onRunProgram}
                disabled={isBusy}
                className="mt-4 gap-2"
              >
                <Play className="h-4 w-4" /> Run Analysis
              </Button>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
