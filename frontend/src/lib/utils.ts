import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { useState, useCallback } from "react"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function rgbToHex(rgb: string) {
  const values = rgb.substring(rgb.indexOf('(') + 1, rgb.lastIndexOf(')')).split(/, ?/);
  const hex = values.map(value => {
    const hexValue = parseInt(value).toString(16);
    return hexValue.length === 1 ? '0' + hexValue : hexValue;
  }).join('');
  return '#' + hex;
}

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + " bytes";
  else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
};

// Domain color mapping function
export function getDomainColor(domain?: string): string {
  if (!domain) return "#6c757d" // Default gray for undefined domains

  // Map domains to colors
  const colorMap: Record<string, string> = {
    "Computational Chemistry": "#3498db",
    "Geographical Information Science": "#e74c3c",
    "Psychology and Cognitive science": "#9b59b6",
    "Machine Learning": "#f39c12",
    "Deep Learning": "#1abc9c",
    Robotics: "#e67e22",
    "Speech Recognition": "#34495e",
    "Time Series": "#16a085",
    "Graph Neural Networks": "#d35400",
    "Generative AI": "#8e44ad",
    "Recommender Systems": "#2980b9",
    Bioinformatics: "#27ae60",
    Healthcare: "#c0392b",
    Finance: "#7f8c8d",
  }

  return colorMap[domain] || "#6c757d" // Return mapped color or default
}

// Utility function to throttle function calls
export const throttle = <T extends (...args: any[]) => any>(func: T, limit: number): T => {
  let inThrottle = false
  let lastResult: ReturnType<T>

  return ((...args: Parameters<T>): ReturnType<T> => {
    if (!inThrottle) {
      inThrottle = true
      lastResult = func(...args)
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
    return lastResult
  }) as T
}

// Helper function to get/set expanded state in localStorage
export const useLocalStorageState = (key: string, initialValue: boolean): [boolean, (value: boolean) => void] => {
  // Create a unique key for this session to avoid conflicts
  const sessionKey = `expanded_${key}`

  // Initialize state from localStorage or default value
  const [state, setState] = useState<boolean>(() => {
    try {
      const item = localStorage.getItem(sessionKey)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      console.error("Error reading from localStorage:", error)
      return initialValue
    }
  })

  // Update localStorage when state changes
  const setStateWithStorage = useCallback(
    (value: boolean) => {
      try {
        setState(value)
        localStorage.setItem(sessionKey, JSON.stringify(value))
      } catch (error) {
        console.error("Error writing to localStorage:", error)
      }
    },
    [sessionKey],
  )

  return [state, setStateWithStorage]
}

// Helper function for auto-scrolling to the bottom of a container
export const scrollIntoView = (userScrolled: boolean, ref: React.RefObject<HTMLDivElement | null>) => {
  if (!userScrolled && ref.current) {
    // Use requestAnimationFrame for smoother scrolling during streaming
    requestAnimationFrame(() => {
      const container = ref.current?.closest(".scroll-area-viewport") as HTMLElement
      if (container) {
        container.scrollTop = container.scrollHeight
      } else {
        ref.current?.scrollIntoView({ behavior: "auto" })
      }
    })
  }
}

export const downloadText = (filename: string, text: string) => {
  const element = document.createElement('a');
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  element.setAttribute('download', filename);

  element.style.display = 'none';
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}