import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { OcrLine, ParsedReceipt, parseReceiptLines } from './receipt-parser';

// Matches the 5MB client-side cap in AddExpenseComponent.processSelectedFile.
// Bounds the decoded image, not the wire payload (base64 inflates that by
// ~4/3, still comfortably under the callable function's 10MB request limit).
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/**
 * Deskew/denoise a receipt photo before handing it to Tesseract. Real-world
 * phone photos (skew, shadows, low contrast) OCR noticeably worse without
 * this — see .claude/future-ideas.md for context.
 */
async function preprocessImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate() // auto-orient using EXIF, then strip it
    .grayscale()
    .normalize()
    .sharpen()
    .toFormat('png')
    .toBuffer();
}

/**
 * Run OCR and return per-line text + confidence. A fresh worker is created
 * and torn down per call; Tesseract.js caches its downloaded language data
 * under the OS tmp dir, so warm function instances skip the re-download but
 * cold starts pay a one-time fetch.
 */
async function recognizeLines(buffer: Buffer): Promise<OcrLine[]> {
  const worker = await createWorker('eng');
  try {
    // The hierarchical blocks/paragraphs/lines output is opt-in - without
    // this, data.blocks is empty and every line is silently dropped.
    const { data } = await worker.recognize(buffer, {}, { blocks: true });
    const lines: OcrLine[] = [];
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs) {
        for (const line of paragraph.lines) {
          lines.push({ text: line.text, confidence: line.confidence });
        }
      }
    }
    return lines;
  } finally {
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
  { memory: '1GiB', timeoutSeconds: 60 },
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
      const preprocessed = await preprocessImage(buffer);
      const lines = await recognizeLines(preprocessed);
      return parseReceiptLines(lines);
    } catch (error) {
      console.error('Error scanning receipt:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new HttpsError('internal', `Error scanning receipt: ${errorMessage}`);
    }
  }
);
