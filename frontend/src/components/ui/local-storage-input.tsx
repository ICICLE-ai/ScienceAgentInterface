"use client"

import React, { useState, useEffect } from "react"
import { Eye, EyeOff, HelpCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface LocalStorageInputProps {
  storageKey: string
  label?: string
  placeholder?: string
  type?: "text" | "password"
  showToggle?: boolean
  className?: string
  inputClassName?: string
  defaultValue?: string
  help?: string
  onChange?: (value: string) => void
}

export function LocalStorageInput({
  storageKey,
  label,
  placeholder,
  type = "text",
  showToggle = false,
  className = "",
  inputClassName = "",
  defaultValue = "",
  help,
  onChange,
}: LocalStorageInputProps) {
  const [value, setValue] = useState<string>(defaultValue)
  const [isVisible, setIsVisible] = useState<boolean>(type !== "password")

  // Load value from localStorage on mount
  useEffect(() => {
    const savedValue = localStorage.getItem(storageKey)
    if (savedValue !== null) {
      setValue(savedValue)
      onChange?.(savedValue)
    }
  }, [storageKey, onChange])

  // Save to localStorage whenever value changes
  useEffect(() => {
    localStorage.setItem(storageKey, value)
  }, [storageKey, value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setValue(newValue)
    onChange?.(newValue)
  }

  const inputType = showToggle ? (isVisible ? "text" : "password") : type

  return (
    <div className={className}>
      {label && (
        <Label htmlFor={storageKey} className="mb-2 flex items-center gap-2">
          {label}
          {help && (
            <TooltipProvider>
              <Tooltip delayDuration={100}>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full">
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">{help}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </Label>
      )}
      <div className="relative">
        <Input
          id={storageKey}
          type={inputType}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          className={`${showToggle ? "pr-12" : ""} ${inputClassName}`}
        />
        {showToggle && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
            onClick={() => setIsVisible(!isVisible)}
          >
            {isVisible ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  )
}