import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Trash2 } from "lucide-react";
import { Button } from "./button";
import { Progress } from "./progress";
import { formatFileSize } from "@/lib/utils";

export interface UploadedFile {
  name: string;
  size: number;
  progress: number;
  status: "uploading" | "completed" | "error";
}

interface FileUploaderProps {
  files: UploadedFile[];
  onFilesAdded: (files: File[]) => void;
  onFileDelete: (fileId: string) => void;
  maxSize?: number; // in bytes
  accept?: Record<string, string[]>;
  multiple?: boolean;
}

export function FileUploader({
  files,
  onFilesAdded,
  onFileDelete,
  maxSize = 100 * 1024 * 1024, // 100MB by default
  accept,
  multiple = true,
}: FileUploaderProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      onFilesAdded(acceptedFiles);
    },
    [onFilesAdded]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize,
    accept,
    multiple,
  });

  return (
    <div className="w-full space-y-2">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-md p-4 text-center cursor-pointer transition-colors ${
          isDragActive ? "border-primary bg-primary/10" : "border-muted hover:border-muted-foreground"
        }`}
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p className="text-primary">Drop files here...</p>
        ) : (
          <div>
            <p>Drop files here, or click to select</p>
            <p className="text-sm text-muted-foreground">
              Maximum file size: {formatFileSize(maxSize)}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {files.map((file, i) => (
          <div key={i} className="bg-muted rounded-md p-3 flex flex-col">
            <div className="flex justify-between items-start">
              <div className="truncate flex-1">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="ml-2"
                onClick={() => onFileDelete(file.name)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {file.status === "uploading" && (
              <Progress value={file.progress} className="h-1" />
            )}
            {file.status === "error" && (
              <p className="text-xs text-destructive mt-1">Failed to upload</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
