"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useTheme } from "@/components/theme-provider"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

interface CsvViewerProps {
  url: string
  onClick?: () => void
}

const CsvViewer: React.FC<CsvViewerProps> = ({ url, onClick }) => {
  const [rows, setRows] = useState<string[][]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const { theme } = useTheme()

  useEffect(() => {
    let isMounted = true
    setLoading(true)

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch CSV: ${response.status}`)
        }
        return response.text()
      })
      .then((text) => {
        if (!isMounted) return

        // Simple CSV parsing – this does not handle quoted commas, etc.
        const parsed = text
          .split("\n")
          .map((row) => row.trim())
          .filter((row) => row.length > 0)
          .map((row) => row.split(","))

        setRows(parsed)
        setLoading(false)
      })
      .catch((err) => {
        if (!isMounted) return

        console.error(err)
        setError(err.message)
        setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [url])

  // Handler to ensure clicks on any part of the table trigger the modal
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Directly call the onClick function with no conditions
    onClick && onClick()
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-primary"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center text-destructive p-4 bg-destructive/10 rounded-md">Error loading CSV: {error}</div>
    )
  }

  if (rows.length === 0) {
    return <div className="text-center text-muted-foreground p-4">No data found in CSV file.</div>
  }

  // Only render a limited number of rows for performance
  const MAX_PREVIEW_ROWS = 100
  const displayRows =
    rows.length > MAX_PREVIEW_ROWS + 1 ? [...rows.slice(0, 1), ...rows.slice(1, MAX_PREVIEW_ROWS + 1)] : rows

  const hasMoreRows = rows.length > MAX_PREVIEW_ROWS + 1

  return (
    <div
      className="overflow-auto max-h-[400px] rounded-md border border-border cursor-pointer relative"
      onClick={handleClick}
    >
      <ScrollArea className="w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm pointer-events-none">
            <thead>
              <tr className={theme === "dark" ? "bg-muted/60" : "bg-muted/80"}>
                {displayRows[0].map((cell, idx) => (
                  <th
                    key={idx}
                    className="px-3 py-2 text-left font-medium border-b border-border sticky top-0 z-10 whitespace-nowrap"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.slice(1).map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={`
                ${rowIndex % 2 === 0 ? "bg-background" : "bg-muted/30"} 
                hover:bg-muted/50 transition-colors
              `}
                >
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-3 py-2 border-t border-border whitespace-nowrap">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}

              {hasMoreRows && (
                <tr className="bg-muted/10">
                  <td
                    colSpan={displayRows[0].length}
                    className="px-3 py-2 text-center text-muted-foreground border-t border-border"
                  >
                    {rows.length - MAX_PREVIEW_ROWS - 1} more rows (click to view all)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}

export default CsvViewer
