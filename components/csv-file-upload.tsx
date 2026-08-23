'use client';

import { FileSpreadsheet, Upload, X } from 'lucide-react';
import { ChangeEvent, DragEvent, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  parseSpreadsheetFile,
  SPREADSHEET_ACCEPT,
  spreadsheetValidationError,
} from '@/lib/spreadsheet';
import { cn } from '@/lib/utils';

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

  const parseFile = async (selected: File | undefined) => {
    if (!selected) return;

    const validation = spreadsheetValidationError(selected);
    if (validation) {
      onError(validation);
      return;
    }

    setFile(selected);
    setParsing(true);
    setProgress(15);

    try {
      setProgress(55);
      const parsed = await parseSpreadsheetFile(selected);
      setProgress(100);
      setParsing(false);
      onParsed({ file: selected, headers: parsed.headers, rows: parsed.rows });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not read this spreadsheet.';
      onError(message);
      resetLocal();
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void parseFile(event.target.files?.[0]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    void parseFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div className="w-full space-y-3" data-tour="import-upload">
      <input
        id="import-csv-upload"
        ref={fileInputRef}
        type="file"
        className="sr-only"
        accept={SPREADSHEET_ACCEPT}
        onChange={handleFileChange}
        disabled={parsing}
      />

      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload applications spreadsheet"
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
            dragOver
              ? 'border-primary bg-primary/10'
              : 'border-border/80 uma-nested-surface hover:border-primary/50 uma-hover-on-nested',
          )}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
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
          <span
            className={cn(
              'mb-4 flex size-12 items-center justify-center rounded-2xl ring-1',
              dragOver
                ? 'bg-primary/15 text-primary ring-primary/25'
                : 'bg-muted text-muted-foreground ring-border/60',
            )}
          >
            <Upload className="size-5" aria-hidden />
          </span>
          <p className="text-sm font-medium text-foreground">
            {dragOver ? 'Drop file to upload' : 'Drop your applications spreadsheet here'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            or{' '}
            <span className="font-medium text-primary underline-offset-4 hover:underline">
              browse files
            </span>
          </p>
          <p className="mt-4 text-xs text-muted-foreground">CSV, Excel, or ODS · up to 10MB</p>
        </div>
      ) : (
        <div className="relative rounded-xl border border-border/70 bg-background px-4 py-4 shadow-none">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
            aria-label="Remove file"
            onClick={handleRemove}
            disabled={parsing}
          >
            <X className="size-4 shrink-0" aria-hidden />
          </Button>

          <div className="flex items-center gap-3 pr-8">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20">
              <FileSpreadsheet className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {parsing ? 'Reading file…' : formatFileSize(file.size)}
              </p>
            </div>
          </div>

          {parsing ? (
            <div className="mt-4 flex items-center gap-3">
              <Progress value={progress} className="min-w-0 flex-1 gap-0">
                <span className="sr-only">Upload progress</span>
              </Progress>
              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                {progress}%
              </span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
