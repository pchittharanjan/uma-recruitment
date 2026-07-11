'use client';

import { File, FileSpreadsheet, X } from 'lucide-react';
import Papa from 'papaparse';
import { ChangeEvent, DragEvent, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

const MAX_BYTES = 10 * 1024 * 1024;

export interface CsvParseResult {
  file: File;
  headers: string[];
  rows: Record<string, string>[];
}

interface CsvFileUploadProps {
  onParsed: (result: CsvParseResult) => void;
  onError: (message: string) => void;
  onClear?: () => void;
}

function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

export default function CsvFileUpload({ onParsed, onError, onClear }: CsvFileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetLocal = () => {
    setFile(null);
    setProgress(0);
    setParsing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemove = () => {
    resetLocal();
    onClear?.();
  };

  const parseFile = (selected: File) => {
    if (!selected.name.toLowerCase().endsWith('.csv')) {
      onError('Please upload a CSV file.');
      return;
    }
    if (selected.size > MAX_BYTES) {
      onError('File is too large. Max size is 10MB.');
      return;
    }

    setFile(selected);
    setParsing(true);
    setProgress(0);

    const reader = new FileReader();

    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.min(90, Math.round((e.loaded / e.total) * 90)));
      }
    };

    reader.onload = (e) => {
      const text = e.target?.result as string;
      setProgress(95);

      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
      });

      if (parsed.errors.length > 0 && parsed.data.length === 0) {
        onError('Could not read this CSV. Check the file format.');
        resetLocal();
        return;
      }

      const headers = parsed.meta.fields ?? [];
      if (headers.length === 0) {
        onError('CSV has no columns.');
        resetLocal();
        return;
      }

      setProgress(100);
      setParsing(false);
      onParsed({ file: selected, headers, rows: parsed.data });
    };

    reader.onerror = () => {
      onError('Failed to read file.');
      resetLocal();
    };

    reader.readAsText(selected);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    parseFile(event.target.files?.[0] as File);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    parseFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div className="w-full">
      <div
        className={cn(
          'mt-2 flex justify-center rounded-md border border-dashed px-6 py-12 transition-colors',
          dragOver
            ? 'border-primary bg-primary/8'
            : 'border-input bg-transparent hover:border-primary/40 hover:bg-muted/40',
        )}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOver(false);
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="text-center">
          <File
            className={cn(
              'mx-auto h-12 w-12 transition-colors',
              dragOver ? 'text-primary' : 'text-muted-foreground',
            )}
            aria-hidden
          />
          <div
            className={cn(
              'mt-3 flex flex-wrap justify-center text-sm leading-6 transition-colors',
              dragOver ? 'font-medium text-primary' : 'text-muted-foreground',
            )}
          >
            {dragOver ? (
              <span>Drop CSV to upload</span>
            ) : (
              <>
                <span>Drag and Drop or</span>
                <label
                  htmlFor="import-csv-upload"
                  className="cursor-pointer rounded-sm pl-1 font-medium text-primary hover:underline hover:underline-offset-4"
                >
                  <span>choose file</span>
                  <input
                    id="import-csv-upload"
                    ref={fileInputRef}
                    type="file"
                    className="sr-only"
                    accept=".csv"
                    onChange={handleFileChange}
                    disabled={parsing}
                  />
                </label>
                <span className="pl-1">to upload</span>
              </>
            )}
          </div>
        </div>
      </div>

      <p className="mt-2 flex flex-wrap items-center justify-between gap-1 text-sm leading-5 text-muted-foreground">
        <span>Accepted: CSV files</span>
        <span>Max size: 10MB</span>
      </p>

      {file && (
        <Card className="relative mt-6 gap-4 bg-muted p-4 shadow-none">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-1 top-1 text-muted-foreground hover:text-foreground"
            aria-label="Remove file"
            onClick={handleRemove}
            disabled={parsing}
          >
            <X className="h-5 w-5 shrink-0" aria-hidden />
          </Button>

          <div className="flex items-center gap-2.5 pr-8">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card">
              <FileSpreadsheet className="h-5 w-5 text-foreground" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Progress value={progress} className="min-w-0 flex-1 gap-0">
              <span className="sr-only">Upload progress</span>
            </Progress>
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
              {progress}%
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
