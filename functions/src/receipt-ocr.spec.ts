import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { extractPdfLines, isPdf, preprocessImage } from './receipt-ocr';
import { BLANK_PDF_BASE64, WITH_TEXT_PDF_BASE64 } from './receipt-fixtures';

describe('isPdf', () => {
  it('recognizes a buffer starting with the PDF magic bytes', () => {
    const buffer = Buffer.from(WITH_TEXT_PDF_BASE64, 'base64');
    expect(isPdf(buffer)).toBe(true);
  });

  it('returns false for a non-PDF buffer', () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic bytes
    expect(isPdf(buffer)).toBe(false);
  });

  it('returns false for a buffer shorter than the magic bytes', () => {
    expect(isPdf(Buffer.from('PD'))).toBe(false);
  });
});

describe('extractPdfLines', () => {
  it('extracts lines from a PDF with a real text layer', async () => {
    const buffer = Buffer.from(WITH_TEXT_PDF_BASE64, 'base64');
    const lines = await extractPdfLines(buffer);

    expect(lines.map((l) => l.text)).toEqual([
      'Coffee Shop',
      'Latte   4.50',
      'Tax   0.39',
      'Total   4.89',
    ]);
    // Exact text extraction, not OCR - always full confidence.
    expect(lines.every((l) => l.confidence === 100)).toBe(true);
  });

  it('returns no lines for an image-only PDF with no text layer', async () => {
    const buffer = Buffer.from(BLANK_PDF_BASE64, 'base64');
    const lines = await extractPdfLines(buffer);

    expect(lines).toEqual([]);
  });
});

describe('preprocessImage', () => {
  const solid = (width: number, height: number) =>
    sharp({
      create: { width, height, channels: 3, background: { r: 200, g: 200, b: 200 } },
    })
      .png()
      .toBuffer();

  const widthOf = async (buffer: Buffer) => (await sharp(buffer).metadata()).width;

  it('enlarges a very narrow image 3x so small type survives OCR', async () => {
    const out = await preprocessImage(await solid(294, 329));
    expect(await widthOf(out)).toBe(294 * 3);
  });

  it('enlarges a moderately narrow image 2x', async () => {
    const out = await preprocessImage(await solid(600, 800));
    expect(await widthOf(out)).toBe(1200);
  });

  it('leaves a full-size photo at its original width', async () => {
    const out = await preprocessImage(await solid(1600, 1200));
    expect(await widthOf(out)).toBe(1600);
  });
});
