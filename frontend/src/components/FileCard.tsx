import React from "react"
import { useState } from "react"
import { useTheme } from "@/providers/ThemeProvider"
import { OutputFile, outputFileUrl } from "../api/api"
import { formatFileSize, useLocalStorageState } from "@/lib/utils"
import { ImageIcon, Files, FileCode, Download, ChevronDown } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CsvViewer } from "@/components/CsvViewer"
import { ContentModal } from "./ContentModal"

interface FileCardProps {
  file: OutputFile
}

export const FileCard: React.FC<FileCardProps> = ({ file }) => {
  // Use localStorage to persist expanded state
  const [expanded, setExpanded] = useLocalStorageState(`file_${file.filename}`, false)
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const { theme } = useTheme()

  // Prevent card toggle when clicking on the download link
  const handleDownloadClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()

    // Create a temporary anchor element to trigger download
    const a = document.createElement("a")
    a.href = outputFileUrl(file)
    a.download = file.filename
    a.target = "_blank"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // Open modal when clicking on content
  const handleContentClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setModalOpen(true)
  }

  // Toggle expanded state with localStorage persistence
  const toggleExpanded = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setExpanded(!expanded)
  }

  // Check file extension in a case-insensitive manner
  const isCsv = file.filename.toLowerCase().endsWith(".csv")
  const isImage = /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(file.filename)
  const fileIcon = isImage ? (
    <ImageIcon className="h-5 w-5" />
  ) : isCsv ? (
    <Files className="h-5 w-5" />
  ) : (
    <FileCode className="h-5 w-5" />
  )

  // Use the full filename and let CSS handle truncation
  const fullFilename = file.filename

  return (
    <>
      <Card className="h-full">
        <CardHeader className="p-3">
          <div className="flex justify-between items-center cursor-pointer select-none" onClick={toggleExpanded}>
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`
                  p-2 rounded-md flex-shrink-0
                  ${theme === "dark" ? "bg-muted/50" : "bg-muted"}
                `}
              >
                {fileIcon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-card-foreground truncate" title={fullFilename}>
                  {fullFilename}
                </p>
                <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleExpanded}>
                {expanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4 transform -rotate-90" />
                )}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownloadClick}>
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        {expanded && (
          <CardContent className="p-3">
            {isCsv ? (
              <div className="cursor-pointer hover:opacity-90 transition-opacity" onClick={handleContentClick}>
                <CsvViewer url={outputFileUrl(file)} onClick={() => setModalOpen(true)} />
              </div>
            ) : isImage ? (
              <div
                className="flex flex-col items-center cursor-pointer hover:opacity-90 transition-opacity"
                onClick={handleContentClick}
              >
                <img
                  src={outputFileUrl(file) || "/placeholder.svg"}
                  alt={file.filename}
                  className="max-w-full max-h-60 object-contain rounded-md"
                />
              </div>
            ) : (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">
                  Preview not available for this file type. Click the download button to view.
                </p>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Modal for fullscreen view */}
      <ContentModal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={fullFilename}>
        {isCsv ? (
          <div className="h-full">
            <CsvViewer url={outputFileUrl(file)} />
          </div>
        ) : isImage ? (
          <div className="flex items-center justify-center h-full">
            <img
              src={outputFileUrl(file) || "/placeholder.svg"}
              alt={file.filename}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        ) : null}
      </ContentModal>
    </>
  )
}