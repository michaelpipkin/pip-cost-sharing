import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
/**
 * Shared Firebase Admin SDK initialization for ad hoc query scripts.
 *
 * Authentication: Application Default Credentials (ADC).
 * One-time setup: run `gcloud auth application-default login`
 */
import {
  getFirestore,
  type DocumentData,
  type QuerySnapshot,
} from 'firebase-admin/firestore';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

initializeApp({ projectId: 'pip-cost-sharing' });

export const db = getFirestore();
export const auth = getAuth();

// Auth accounts that will never have (or need) a Firestore users doc, so
// they're false positives in any "orphaned registration" query rather than
// real sign-ups. play_review@google.com is the account Google Play's review
// crawler requires for Play Store developer verification - it has no
// in-app usage at all.
export const NON_USER_AUTH_EMAILS = new Set(['play_review@google.com']);

/** Pretty-print every document in a QuerySnapshot. */
export function dump(snap: QuerySnapshot<DocumentData>): void {
  if (snap.empty) {
    console.log('(no results)');
    return;
  }
  snap.forEach((d) => console.log(d.id, JSON.stringify(d.data(), null, 2)));
}

/** Print a labelled count. */
export function logCount(label: string, n: number): void {
  console.log(`${label}: ${n}`);
}

/**
 * Write query results as a formatted HTML table to scripts/db/results.html.
 * The runner (run.ts) detects this file after the query finishes and opens it.
 * Column headers are derived from the object keys of the first row.
 */
export function writeTable(
  title: string,
  rows: Record<string, unknown>[]
): void {
  if (rows.length === 0) {
    console.log('\n(no results to write to HTML)');
    return;
  }

  const cols = Object.keys(rows[0]!);
  const now = new Date().toLocaleString();
  const headerCells = cols.map((c) => `<th>${esc(c)}</th>`).join('');
  const bodyRows = rows.map((row) => renderRow(row, cols)).join('\n      ');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 2rem; color: #212121; background: #fafafa; }
    h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
    .meta { color: #757575; font-size: .8rem; margin: 0 0 1.5rem; }
    table { border-collapse: collapse; background: white; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,.12); overflow: hidden; }
    th { background: #1565c0; color: white; padding: .65rem 1.25rem; text-align: left; font-weight: 600; font-size: .75rem; letter-spacing: .05em; text-transform: uppercase; white-space: nowrap; }
    td { padding: .5rem 1.25rem; border-bottom: 1px solid #eeeeee; font-size: .875rem; white-space: nowrap; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #e3f2fd; }
    .count { color: #757575; margin-top: .75rem; font-size: .8rem; }
  </style>
</head>
<body>
  <h1>${esc(title)}</h1>
  <p class="meta">Generated ${now} &nbsp;&middot;&nbsp; pip-cost-sharing</p>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>
      ${bodyRows}
    </tbody>
  </table>
  <p class="count">${rows.length} result${rows.length === 1 ? '' : 's'}</p>
</body>
</html>`;

  writeFileSync(join(__dirname, 'results.html'), html, 'utf-8');
}

function renderRow(row: Record<string, unknown>, cols: string[]): string {
  const cells = cols.map((c) => `<td>${esc(formatCell(row[c]))}</td>`).join('');
  return `<tr>${cells}</tr>`;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toLocaleString();
  }
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'boolean':
    case 'bigint':
      return value.toString();
    default:
      return JSON.stringify(value);
  }
}

function esc(s: string): string {
  return s
    .replaceAll(/&/g, '&amp;') //NOSONAR
    .replaceAll(/</g, '&lt;') //NOSONAR
    .replaceAll(/>/g, '&gt;') //NOSONAR
    .replaceAll(/"/g, '&quot;'); //NOSONAR
}
