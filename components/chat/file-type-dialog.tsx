"use client";

import { useRef, useState, type DragEvent, type ChangeEvent } from "react";
import {
  FileCodeIcon,
  FileTextIcon,
  FileUpIcon,
  UploadCloudIcon,
  XIcon,
  AlertCircleIcon,
  CheckIcon,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FileTypeCategory = "all" | "markdown" | "pdf";

export type FileTypeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (file: File | null, category: FileTypeCategory) => void;
};

const CATEGORIES = [
  {
    id: "all" as const,
    label: "All Formats",
    description: "Markdown, Plain Text, or PDF",
    accept: ".md,.markdown,.txt,.pdf",
  },
  {
    id: "markdown" as const,
    label: "Markdown / Text",
    description: ".md, .markdown, .txt",
    accept: ".md,.markdown,.txt",
  },
  {
    id: "pdf" as const,
    label: "PDF Document",
    description: ".pdf files up to 10 MB",
    accept: ".pdf",
  },
];

export function FileTypeDialog({
  open,
  onOpenChange,
  onConfirm,
}: FileTypeDialogProps) {
  const [selectedCategory, setSelectedCategory] = useState<FileTypeCategory>("all");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentCategoryConfig =
    CATEGORIES.find((c) => c.id === selectedCategory) || CATEGORIES[0];

  function validateAndSetFile(file: File | undefined) {
    if (!file) return;
    setErrorMessage(null);

    const ext = file.name.toLowerCase();
    const isMarkdownOrText =
      ext.endsWith(".md") || ext.endsWith(".markdown") || ext.endsWith(".txt");
    const isPdf = ext.endsWith(".pdf");

    if (!isMarkdownOrText && !isPdf) {
      setErrorMessage("Please select a supported file (.md, .markdown, .txt, or .pdf).");
      return;
    }

    if (selectedCategory === "markdown" && !isMarkdownOrText) {
      setErrorMessage("Selected file is not a Markdown or text document (.md, .markdown, .txt).");
      return;
    }

    if (selectedCategory === "pdf" && !isPdf) {
      setErrorMessage("Selected file is not a PDF document (.pdf).");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("File exceeds the maximum allowed size of 10 MB.");
      return;
    }

    setSelectedFile(file);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  }

  function handleClose() {
    setSelectedFile(null);
    setErrorMessage(null);
    onOpenChange(false);
  }

  function handleProceed() {
    onConfirm(selectedFile, selectedCategory);
    setSelectedFile(null);
    setErrorMessage(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-w-[calc(100%-2rem)]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent">
              <FileUpIcon className="h-4 w-4" />
            </div>
            <DialogTitle>Upload Document</DialogTitle>
          </div>
          <DialogDescription>
            Choose a document type and select a file to index into RepoMind.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* File Type Categories */}
          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">
              Document Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((category) => {
                const isSelected = selectedCategory === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(category.id);
                      setErrorMessage(null);
                      // If file doesn't match newly selected category, clear it
                      if (selectedFile) {
                        const ext = selectedFile.name.toLowerCase();
                        if (category.id === "markdown" && ext.endsWith(".pdf")) {
                          setSelectedFile(null);
                        } else if (
                          category.id === "pdf" &&
                          !ext.endsWith(".pdf")
                        ) {
                          setSelectedFile(null);
                        }
                      }
                    }}
                    className={cn(
                      "flex flex-col items-start p-2.5 rounded-lg border text-left transition-all",
                      isSelected
                        ? "border-accent bg-accent/10 text-foreground ring-1 ring-accent"
                        : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <span className="text-xs font-semibold flex items-center justify-between w-full">
                      {category.label}
                      {isSelected && <CheckIcon className="h-3.5 w-3.5 text-accent" />}
                    </span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      {category.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={currentCategoryConfig.accept}
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Drag & Drop / File Selection Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-5 text-center cursor-pointer transition-colors",
              isDragging
                ? "border-accent bg-accent/10"
                : selectedFile
                  ? "border-accent/60 bg-card"
                  : "border-border/80 bg-muted/20 hover:bg-muted/40 hover:border-border",
            )}
          >
            {selectedFile ? (
              <div className="flex items-center justify-between w-full bg-muted/40 p-2.5 rounded-md border border-border">
                <div className="flex items-center gap-2.5 min-w-0">
                  {selectedFile.name.toLowerCase().endsWith(".pdf") ? (
                    <FileTextIcon className="h-5 w-5 text-accent shrink-0" aria-hidden />
                  ) : (
                    <FileCodeIcon className="h-5 w-5 text-accent shrink-0" aria-hidden />
                  )}
                  <div className="text-left min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate max-w-[200px] sm:max-w-[280px]">
                      {selectedFile.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {Math.round(selectedFile.size / 1024)} KB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    setErrorMessage(null);
                  }}
                  className="p-1 rounded text-muted-foreground hover:text-destructive"
                  aria-label="Remove selected file"
                >
                  <XIcon className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ) : (
              <>
                <UploadCloudIcon className="h-7 w-7 text-accent" aria-hidden />
                <p className="text-xs font-semibold text-foreground">
                  Click to choose or drag and drop a file
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Filtered by: {currentCategoryConfig.label} ({currentCategoryConfig.accept})
                </p>
              </>
            )}
          </div>

          {/* Error message */}
          {errorMessage && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-destructive text-xs">
              <AlertCircleIcon className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            size="sm"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleProceed}
            size="sm"
            className="gap-1.5"
          >
            <span>Confirm & Proceed</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
