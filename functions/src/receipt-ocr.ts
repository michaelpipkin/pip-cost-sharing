import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as path from 'node:path';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { callableAppCheck } from './common';
import {
  hasReadableText,
  OcrLine,
  ParsedReceipt,
  parseReceiptLines,
} from './receipt-parser';

// Points pdf.js at its own bundled font metrics so it doesn't warn (and
// fall back to less accurate glyph-width guesses) for PDFs using standard,
// non-embedded fonts - harmless for us either way since we only read text
// content, not rendered positions, but keeps Cloud Functions logs clean.
// pdf.js requires a literal trailing "/" here regardless of OS, so this
// can't just use path.sep (would be "\" on Windows).
const PDF_STANDARD_FONT_DATA_URL =
  path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') +
  '/';

// Matches the 5MB client-side cap in AddExpenseComponent.processSelectedFile.
// Bounds the decoded image, not the wire payload (base64 inflates that by
// ~4/3, still comfortably under the callable function's 10MB request limit).
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const PDF_MAGIC = Buffer.from('%PDF-', 'latin1');

export function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
}

// Below this many extracted characters, treat the PDF as having no usable
// text layer (e.g. a stray watermark run) rather than a real receipt.
const MIN_PDF_TEXT_LENGTH = 20;

/**
 * Extracts text directly from a PDF's text layer - no OCR involved, and
 * more reliable than OCR since it's exact text rather than image
 * recognition. Only works for PDFs that actually have a text layer (e.g. an
 * emailed or downloaded digital receipt). A paper receipt scanned or
 * photographed and saved as an image-only PDF has no text layer and yields
 * nothing here - the caller treats that as "ask the user for a photo
 * instead" rather than attempting to rasterize and OCR the PDF page.
 * Rasterizing would need a canvas implementation; the classic `canvas`
 * package has a well-documented history of "libcairo.so.2: cannot open
 * shared object file" failures in containerized/serverless deployments
 * (including reports specific to Google Cloud Functions) since it dynamically
 * links system graphics libraries at runtime rather than bundling them the
 * way sharp does - not a risk worth taking for what should be a rare case
 * (most people photograph a receipt; saving that scan as a PDF first is an
 * extra, unusual step). See .claude/future-ideas.md for the full writeup.
 */
export async function extractPdfLines(buffer: Buffer): Promise<OcrLine[]> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: PDF_STANDARD_FONT_DATA_URL,
  }).promise;

  const lines: OcrLine[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    // getTextContent() returns individual text runs, not lines - group runs
    // that share a y-coordinate (transform[5]) back into lines.
    const rows = new Map<number, string[]>();
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = Math.round(item.transform[5]);
      const existing = rows.get(y) ?? [];
      existing.push(item.str);
      rows.set(y, existing);
    }
    const sortedYs = [...rows.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const text = rows.get(y)!.join(' ').trim();
      // Exact text extraction, not a guess - full confidence.
      if (text) lines.push({ text, confidence: 100 });
    }
  }
  return lines;
}

// Tesseract reads small type badly: at ~300px wide, a receipt's "$" comes
// back as "5", "s" or nothing and decimal points get dropped ("$4.00" ->
// "$400"), which silently corrupts every amount. Enlarging narrow images
// (screenshots, tight crops, low-res uploads) fixes it; real phone photos
// are several thousand px wide and are never touched. 2x/3x rather than
// "scale to a fixed width": some arbitrary in-between factors were measurably
// worse on the same image, while 1.5x-4x was reliable.
const MIN_OCR_WIDTH = 1000;
const NARROW_IMAGE_WIDTH = 500;

// A textured photo with no text in it (carpet, a wall, a hand) can keep
// Tesseract busy for minutes, long past the function's own deadline. Give up
// well before that so the caller can answer "no text found" rather than the
// request dying with an opaque timeout.
const OCR_TIMEOUT_MS = 45_000;

/**
 * Deskew/denoise a receipt photo before handing it to Tesseract. Real-world
 * phone photos (skew, shadows, low contrast) OCR noticeably worse without
 * this — see .claude/future-ideas.md for context.
 */
export async function preprocessImage(buffer: Buffer): Promise<Buffer> {
  const { width = 0, height = 0, orientation = 1 } = await sharp(buffer).metadata();
  // EXIF orientations 5-8 are rotated a quarter turn, swapping width/height.
  const orientedWidth = orientation >= 5 ? height : width;

  let pipeline = sharp(buffer).rotate(); // auto-orient using EXIF, then strip it
  if (orientedWidth > 0 && orientedWidth < MIN_OCR_WIDTH) {
    const scale = orientedWidth < NARROW_IMAGE_WIDTH ? 3 : 2;
    pipeline = pipeline.resize({
      width: orientedWidth * scale,
      kernel: 'lanczos3',
    });
  }
  return pipeline.grayscale().normalize().sharpen().toFormat('png').toBuffer();
}

/**
 * Run OCR and return per-line text + confidence. A fresh worker is created
 * and torn down per call; Tesseract.js caches its downloaded language data
 * under the OS tmp dir, so warm function instances skip the re-download but
 * cold starts pay a one-time fetch. Returns no lines if recognition doesn't
 * finish within OCR_TIMEOUT_MS (see above).
 */
async function recognizeLines(buffer: Buffer): Promise<OcrLine[]> {
  const worker = await createWorker('eng');
  let timer: NodeJS.Timeout | undefined;
  try {
    // The hierarchical blocks/paragraphs/lines output is opt-in - without
    // this, data.blocks is empty and every line is silently dropped.
    const recognition = worker.recognize(buffer, {}, { blocks: true });
    // Terminating the worker below rejects an abandoned recognition; nothing
    // is awaiting it by then, so mark it handled.
    recognition.catch(() => undefined);
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), OCR_TIMEOUT_MS);
    });

    const result = await Promise.race([recognition, timeout]);
    if (!result) {
      console.warn(`OCR did not finish within ${OCR_TIMEOUT_MS}ms; giving up`);
      return [];
    }

    const lines: OcrLine[] = [];
    for (const block of result.data.blocks ?? []) {
      for (const paragraph of block.paragraphs) {
        for (const line of paragraph.lines) {
          lines.push({ text: line.text, confidence: line.confidence });
        }
      }
    }
    return lines;
  } finally {
    clearTimeout(timer);
    await worker.terminate();
  }
}

interface ScanReceiptRequest {
  groupId: string;
  /** Raw base64 image bytes — no `data:image/...;base64,` prefix. */
  imageBase64: string;
}

/**
 * Scans a receipt photo and returns a parsed total/tax/tip/line-item
 * breakdown. The image is passed inline as base64 rather than uploaded to
 * Storage first: the receipt-scan wizard keeps the original File in memory
 * client-side (the same way AddExpenseComponent already holds a receipt File
 * until submit) and only ever uploads it once, on final submit, via the
 * existing addExpense/updateExpense path — so there's no temp file in
 * Storage for this function to create or for anything to clean up.
 */
export const scanReceipt = onCall<ScanReceiptRequest>(
  { memory: '1GiB', timeoutSeconds: 60, ...callableAppCheck },
  async (request): Promise<ParsedReceipt> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        'unauthenticated',
        'User must be authenticated to scan a receipt'
      );
    }

    const { groupId, imageBase64 } = request.data;
    if (!groupId || !imageBase64) {
      throw new HttpsError(
        'invalid-argument',
        'groupId and imageBase64 are required'
      );
    }

    const db = getFirestore();
    const membership = await db
      .collection('groups')
      .doc(groupId)
      .collection('members')
      .where('userRef', '==', db.collection('users').doc(uid))
      .where('active', '==', true)
      .limit(1)
      .get();

    if (membership.empty) {
      throw new HttpsError(
        'permission-denied',
        'User must be an active member of the group to scan a receipt'
      );
    }

    const buffer = Buffer.from(imageBase64, 'base64');
    if (buffer.length === 0) {
      throw new HttpsError('invalid-argument', 'Image data is empty');
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new HttpsError('invalid-argument', 'Receipt image is too large to scan');
    }

    try {
      if (isPdf(buffer)) {
        const lines = await extractPdfLines(buffer);
        const textLength = lines.reduce((sum, line) => sum + line.text.length, 0);
        if (textLength < MIN_PDF_TEXT_LENGTH) {
          throw new HttpsError(
            'failed-precondition',
            'This PDF does not contain readable text.',
            { reason: 'pdf-not-readable' }
          );
        }
        return parseReceiptLines(lines);
      }

      const preprocessed = await preprocessImage(buffer);
      const lines = await recognizeLines(preprocessed);
      if (!hasReadableText(lines)) {
        throw new HttpsError(
          'failed-precondition',
          'No readable text was found in this image.',
          { reason: 'no-text-found' }
        );
      }
      return parseReceiptLines(lines);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error('Error scanning receipt:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new HttpsError('internal', `Error scanning receipt: ${errorMessage}`);
    }
  }
);
