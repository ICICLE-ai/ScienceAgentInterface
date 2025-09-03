import React from "react"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

// Modal component for displaying content in a fullscreen overlay
interface ContentModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export const ContentModal: React.FC<ContentModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null

  // Close modal when clicking outside the content area or pressing ESC
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  // Add ESC key handler
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("keydown", handleEscKey)
      // Prevent body scrolling when modal is open
      document.body.style.overflow = "hidden"
    }

    return () => {
      document.removeEventListener("keydown", handleEscKey)
      document.body.style.overflow = ""
    }
  }, [isOpen, onClose])

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-background rounded-lg shadow-lg w-full max-w-5xl max-h-[90vh] flex flex-col animate-in fade-in-0 zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-medium text-lg truncate max-w-[calc(100%-3rem)]">{title}</h3>
          <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-destructive/10">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-4">{children}</div>
      </div>
    </div>
  )
}
