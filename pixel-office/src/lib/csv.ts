/**
 * One CSV cell. Quotes when needed, and defuses spreadsheet formulas: a cell starting with
 * = + - @ (or tab / CR) gets a leading apostrophe, so Excel shows it as text instead of running it.
 */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows to CSV text with a UTF-8 byte-order mark, so Excel reads accents correctly. */
export function toCsv(header: string[], rows: unknown[][]): string {
  return `﻿${[header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
