import Papa from 'papaparse';
import { parseCsv, type ParsedCsv } from '@/lib/csv';

/** Spreadsheet uploads we can parse in-browser / on the server. */
export const SPREADSHEET_EXTENSIONS = [
  '.csv',
  '.xlsx',
  '.xls',
  '.xlsm',
  '.ods',
  '.tsv',
] as const;

export const SPREADSHEET_ACCEPT =
  '.csv,.tsv,.xlsx,.xls,.xlsm,.ods,text/csv,text/tab-separated-values,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet';

const MAX_BYTES = 10 * 1024 * 1024;

export function spreadsheetFileExtension(filename: string): string {
  const lower = filename.trim().toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot >= 0 ? lower.slice(dot) : '';
}

export function isSupportedSpreadsheetFilename(filename: string): boolean {
  const ext = spreadsheetFileExtension(filename);
  return (SPREADSHEET_EXTENSIONS as readonly string[]).includes(ext);
}

export function spreadsheetValidationError(file: { name: string; size: number }): string | null {
  const ext = spreadsheetFileExtension(file.name);
  if (ext === '.numbers') {
    return 'Apple Numbers (.numbers) isn’t supported. In Numbers, use File → Export To → Excel or CSV, then upload that file.';
  }
  if (!isSupportedSpreadsheetFilename(file.name)) {
    return 'Upload a CSV, Excel (.xlsx / .xls), or ODS spreadsheet.';
  }
  if (file.size > MAX_BYTES) {
    return 'File is too large. Max size is 10MB.';
  }
  return null;
}

function cellToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

type XlsxModule = typeof import('xlsx');

function sheetToParsedCsv(XLSX: XlsxModule, sheet: import('xlsx').WorkSheet): ParsedCsv {
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null | undefined)[]>(
    sheet,
    {
      header: 1,
      defval: '',
      blankrows: false,
      raw: false,
    },
  );

  if (matrix.length === 0) {
    throw new Error('Spreadsheet is empty.');
  }

  const headerRow = matrix[0] ?? [];
  const seen: Record<string, number> = {};
  const headers = headerRow.map((cell, index) => {
    let h = cellToString(cell).replace(/^\uFEFF/, '').trim();
    if (!h) h = `column_${index}`;
    if (seen[h] !== undefined) {
      seen[h]++;
      return `${h}_${seen[h]}`;
    }
    seen[h] = 0;
    return h;
  });

  if (headers.length === 0) {
    throw new Error('Spreadsheet has no columns.');
  }

  const rows: Record<string, string>[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    const row: Record<string, string> = {};
    let any = false;
    for (let c = 0; c < headers.length; c++) {
      const value = cellToString(line[c]).trim();
      if (value) any = true;
      row[headers[c]] = value;
    }
    if (any) rows.push(row);
  }

  if (rows.length === 0) {
    throw new Error('Spreadsheet has no data rows.');
  }

  return { headers, rows };
}

/**
 * Parse CSV/TSV text or Excel/ODS binary into the same shape as `parseCsv`.
 * xlsx is loaded only when needed so the import page JS stays smaller.
 */
export async function parseSpreadsheetArrayBuffer(
  buffer: ArrayBuffer,
  filename: string,
): Promise<ParsedCsv> {
  const ext = spreadsheetFileExtension(filename);

  if (ext === '.csv' || ext === '.tsv') {
    const text = new TextDecoder('utf-8').decode(buffer);
    if (ext === '.tsv') {
      const result = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        delimiter: '\t',
        transformHeader: (header, index) => {
          const cleaned = header.replace(/^\uFEFF/, '').trim();
          return cleaned || `column_${index}`;
        },
      });
      if (!result.meta.fields?.length) throw new Error('TSV has no headers');
      if (result.data.length === 0) throw new Error('TSV has no data rows');
      return { headers: result.meta.fields, rows: result.data };
    }
    return parseCsv(text);
  }

  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Spreadsheet has no sheets.');
  }
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) {
    throw new Error('Could not read the first sheet.');
  }
  return sheetToParsedCsv(XLSX, sheet);
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedCsv> {
  const validation = spreadsheetValidationError(file);
  if (validation) throw new Error(validation);
  const buffer = await file.arrayBuffer();
  return parseSpreadsheetArrayBuffer(buffer, file.name);
}
