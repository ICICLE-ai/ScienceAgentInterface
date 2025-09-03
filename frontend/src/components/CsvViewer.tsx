import React from "react"
import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useTheme } from "@/providers/ThemeProvider"

// A simple CSV viewer that fetches and displays CSV content in a table with proper styling.
export const CsvViewer: React.FC<{ url: string; onClick?: () => void }> = ({ url, onClick }) => {
  const [rows, setRows] = useState<string[][]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const { theme } = useTheme()

  // Use a ref to track if the component is mounted
  const isMounted = useRef(true)

  useEffect(() => {
    // Set mounted flag
    isMounted.current = true

    setLoading(true)
    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch CSV: ${response.status}`)
        }
        return response.text()
      })
      .then((text) => {
        // Only update state if component is still mounted
        if (isMounted.current) {
          // Simple CSV parsing – this does not handle quoted commas, etc.
          const parsed = text
            .split("\n")
            .map((row) => row.trim())
            .filter((row) => row.length > 0)
            .map((row) => row.split(","))
          setRows(parsed)
          setLoading(false)
        }
      })
      .catch((err) => {
        // Only update state if component is still mounted
        if (isMounted.current) {
          console.error(err)
          setError(err.message)
          setLoading(false)
        }
      })

    // Cleanup function to set mounted flag to false
    return () => {
      isMounted.current = false
    }
  }, [url])

  // Handler to ensure clicks on any part of the table trigger the modal
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // Directly call the onClick function with no conditions
      onClick && onClick()
    },
    [onClick],
  )

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

  return (
    <div
      className="overflow-auto max-h-[400px] rounded-md border border-border cursor-pointer relative"
      onClick={handleClick} // This should directly call the function that opens the modal
    >
      <div className="overflow-x-auto w-full">
        <table className="w-full text-sm pointer-events-none">
          <thead>
            <tr className={theme === "dark" ? "bg-muted/60" : "bg-muted/80"}>
              {rows[0].map((cell, idx) => (
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
            {rows.slice(1).map((row, rowIndex) => (
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
          </tbody>
        </table>
      </div>
    </div>
  )
}
