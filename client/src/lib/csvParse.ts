import Papa from "papaparse";

export async function parseCsv<T = Record<string, string>>(
  file: File
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<T>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        if (results.errors && results.errors.length > 0) {
          console.warn("CSV parse warnings:", results.errors.slice(0, 3));
        }
        resolve(results.data as T[]);
      },
      error: (err) => reject(err),
    });
  });
}

/**
 * Parse a CSV that has N metadata rows before the actual header row.
 * Reads the file as text, drops the first `skipRows` non-empty lines,
 * then feeds the rest to PapaParse with header=true.
 */
export async function parseCsvSkipRows<T = Record<string, string>>(
  file: File,
  skipRows: number
): Promise<T[]> {
  const text = await file.text();
  // Normalize BOM
  const clean = text.replace(/^\uFEFF/, "");
  // Drop the first `skipRows` lines as-is. We use a simple line splitter
  // because the metadata lines never contain embedded newlines in WATI/Zoom
  // exports (they're simple "Header,Value" rows).
  const lines = clean.split(/\r?\n/);
  const remaining = lines.slice(skipRows).join("\n");
  return new Promise((resolve, reject) => {
    Papa.parse<T>(remaining, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        if (results.errors && results.errors.length > 0) {
          console.warn(
            "CSV parse warnings (skipRows):",
            results.errors.slice(0, 3)
          );
        }
        resolve(results.data as T[]);
      },
      error: (err) => reject(err),
    });
  });
}

/**
 * Auto-detect the header row in a CSV that may have a variable number of
 * leading metadata rows. Scans the first `maxScan` lines looking for one
 * that contains all of `requiredHeaderTokens` (case-insensitive substring
 * match). If found, parses from that line onward; otherwise falls back to
 * `fallbackSkip`.
 */
export async function parseCsvAutoHeader<T = Record<string, string>>(
  file: File,
  requiredHeaderTokens: string[],
  fallbackSkip: number,
  maxScan: number = 15
): Promise<T[]> {
  const text = await file.text();
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/);
  const lower = requiredHeaderTokens.map((t) => t.toLowerCase());
  let headerIdx = -1;
  const scanLimit = Math.min(maxScan, lines.length);
  for (let i = 0; i < scanLimit; i++) {
    const lineLower = (lines[i] || "").toLowerCase();
    if (lower.every((t) => lineLower.includes(t))) {
      headerIdx = i;
      break;
    }
  }
  const skip = headerIdx >= 0 ? headerIdx : fallbackSkip;
  const remaining = lines.slice(skip).join("\n");
  return new Promise((resolve, reject) => {
    Papa.parse<T>(remaining, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        if (results.errors && results.errors.length > 0) {
          console.warn(
            "CSV parse warnings (autoHeader):",
            results.errors.slice(0, 3)
          );
        }
        resolve(results.data as T[]);
      },
      error: (err) => reject(err),
    });
  });
}

export function findCol(
  row: Record<string, any>,
  candidates: string[]
): string | undefined {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const norm = c.toLowerCase().replace(/[\s_]+/g, "");
    const match = keys.find(
      (k) => k.toLowerCase().replace(/[\s_]+/g, "") === norm
    );
    if (match) return match;
  }
  return undefined;
}

export function getVal(
  row: Record<string, any>,
  candidates: string[]
): string {
  const k = findCol(row, candidates);
  if (!k) return "";
  const v = row[k];
  return v == null ? "" : String(v).trim();
}
