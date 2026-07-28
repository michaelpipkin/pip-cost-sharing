import { describe, expect, it } from 'vitest';
import { extractPdfLines, isPdf } from './receipt-ocr';

// Small fixture PDFs (built with pdf-lib, captured as base64 so this test
// doesn't need pdf-lib as a real dependency). WITH_TEXT is a receipt-like
// PDF with a real text layer; BLANK simulates a scanned image-only PDF with
// no text layer at all.
const WITH_TEXT_PDF_BASE64 =
  'JVBERi0xLjcKJYGBgYEKCjYgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCAxNzUKPj4Kc3RyZWFtCnicjc9BCsJADAXQfU4xa0HMZJJMBsSFpcWFG2EuIFJF0UVFPL/TqiBCofmQ1YfH72CdAV2f+wkWm/b6bB/nw34eMRkbRkvOk8tHIHZ5C36oekflRXT5BksO2mh/okIoQU2biCuXL5BnUGfYQTempMikRqI2qgi9lUp95Mi90Scw1UHCRIcQ0VCS6agTeHCEi2MfA4sRQpq6RZA1EcZRw+vXaMoSr9XPFvtzXuACWZcKZW5kc3RyZWFtCmVuZG9iagoKNyAwIG9iago8PAovRmlsdGVyIC9GbGF0ZURlY29kZQovVHlwZSAvT2JqU3RtCi9OIDUKL0ZpcnN0IDI2Ci9MZW5ndGggMzg5Cj4+CnN0cmVhbQp4nNVTUUvEMAx+76/Ioz5Is25rOzkOzrubgohyCoriw9zKMZFWtp7ovzfZTg9R8dmHjy7JlyZpviWAoCDLIAVjIYM8VZCDKXKYTIS8ent2IC+qteuFPG2bHu6Ig7CCeyHnYeMjJGI6FTvuvIrVU1iLMQkSJn8wLrrQbGrXwaRcliWiQUSdETSiWtA5JxQERTbFlKVvgsm2IJ9JEdMZxcoR2ow5HB+4+TZ/SSdxNXMWIzezo/1Zl2stxzvUX/0UUyHPQrOoooO9xaFCpdFQh2lCJW/36Tk6V8Xwf4cb+m+D/3XCL3vm9fKSO8caGLYsV64Pm66mtTOvDBThjxP39OJiW1cHBgtLfRpbkMaGlF2sMJnSVuXafo/xe1nMC6t/yssx04VCs41Rm/Lm/OHR1UN5Npev8fgy8lyjg31nrmmro/BKikb+B3ICIut65n2IrPRB4z7ShGzpre6/PAMPKeTl5iEOJjsTIY+q3g3j7/qkJnwdmtavQV63fub79sPBN74D2mXbVgplbmRzdHJlYW0KZW5kb2JqCgo4IDAgb2JqCjw8Ci9TaXplIDkKL1Jvb3QgMiAwIFIKL0luZm8gMyAwIFIKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL1R5cGUgL1hSZWYKL0xlbmd0aCA0MAovVyBbIDEgMiAyIF0KL0luZGV4IFsgMCA5IF0KPj4Kc3RyZWFtCnicFcSxEQAgDAOxt8MdlOy/JgMkWIWAbrMhKTlVWuKCdH5+MFzEA0cKZW5kc3RyZWFtCmVuZG9iagoKc3RhcnR4cmVmCjc1NQolJUVPRg==';

const BLANK_PDF_BASE64 =
  'JVBERi0xLjcKJYGBgYEKCjUgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL1R5cGUgL09ialN0bQovTiA0Ci9GaXJzdCAyMAovTGVuZ3RoIDI2MQo+PgpzdHJlYW0KeJzVUk1LxDAQvedXzNE9ZZqmTVdKYe3HRYRl8aTsIWzDUpCN9AP03/vSrIoH8ezhkUzem8wkbxJiUqQ1pWQK0pSlispSyMf3V0dyb89uEvJ+6Cd6Bst0oKOQtV8uMyWiqsS3trazffFnEZMoCeJPxX70/XJyI5Vd23XMhplzDeTMqsFaA1tAIQanCuwBo6/AmUmZ0x24LiI3MSfwqza75rdYoc2DpolaXcT4q26o1cY71F/9bCshH3zf2NnRTXOrWOVs0GGaoOTTBt8xOjv7//u4tf/BX3594Q+fg73B5NGFGVhdlgc3+WU8wXboqvBfrh/snX/D1HCYsAxgxuyA/ABDGI3bCmVuZHN0cmVhbQplbmRvYmoKCjYgMCBvYmoKPDwKL1NpemUgNwovUm9vdCAyIDAgUgovSW5mbyAzIDAgUgovRmlsdGVyIC9GbGF0ZURlY29kZQovVHlwZSAvWFJlZgovTGVuZ3RoIDM0Ci9XIFsgMSAyIDIgXQovSW5kZXggWyAwIDcgXQo+PgpzdHJlYW0KeJwVxDEOACAIBLAext3/+ngIHYructmy1XbikXwGQ4wCrwplbmRzdHJlYW0KZW5kb2JqCgpzdGFydHhyZWYKMzc5CiUlRU9G';

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
