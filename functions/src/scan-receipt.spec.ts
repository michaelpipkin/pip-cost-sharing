import { getFirestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
// index.ts initialises the Admin SDK and re-exports scanReceipt.
import { scanReceipt } from './index';
import { BLANK_PDF_BASE64, WITH_TEXT_PDF_BASE64 } from './receipt-fixtures';
import { makeGroup, makeMember, uniqueId } from './test-fixtures';

// Only the guards, the size limits and the PDF text-layer path are driven
// here. The image path runs tesseract, which downloads its language data over
// the network, so no test sends a non-PDF image past the early exits.

const db = getFirestore();
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

function scan(uid: string | null, data: unknown) {
  return Promise.resolve(
    scanReceipt.run({
      auth: uid ? { uid, token: {} } : undefined,
      data,
    } as any)
  );
}

/** A group with the caller as a member (active unless told otherwise). */
async function groupWithMember(fields: { active?: boolean } = {}) {
  const uid = uniqueId('u');
  const group = await makeGroup();
  await makeMember(group, {
    userRef: db.collection('users').doc(uid),
    ...fields,
  });
  return { uid, groupId: group.id };
}

describe('scanReceipt: guards', () => {
  it('refuses an unauthenticated call', async () => {
    await expect(
      scan(null, { groupId: 'g', imageBase64: 'AAAA' })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it.each([
    ['no groupId', { imageBase64: 'AAAA' }],
    ['an empty groupId', { groupId: '', imageBase64: 'AAAA' }],
    ['no image', { groupId: 'g' }],
    ['an empty image', { groupId: 'g', imageBase64: '' }],
  ])('rejects a call with %s as invalid-argument', async (_label, data) => {
    await expect(scan(uniqueId('u'), data)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('refuses a user who is not a member of the group', async () => {
    const { groupId } = await groupWithMember();

    await expect(
      scan(uniqueId('stranger'), { groupId, imageBase64: 'AAAA' })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses a member of a different group only', async () => {
    const { uid } = await groupWithMember();
    const { groupId: otherGroup } = await groupWithMember();

    await expect(
      scan(uid, { groupId: otherGroup, imageBase64: 'AAAA' })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses an inactive member', async () => {
    const { uid, groupId } = await groupWithMember({ active: false });

    await expect(
      scan(uid, { groupId, imageBase64: 'AAAA' })
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('scanReceipt: image size', () => {
  it('rejects data that decodes to no bytes', async () => {
    const { uid, groupId } = await groupWithMember();

    // '====' is a non-empty string, so it clears the required-field check,
    // but contains no base64 payload.
    await expect(
      scan(uid, { groupId, imageBase64: '====' })
    ).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'Image data is empty',
    });
  });

  it('rejects an image over 6 MiB', async () => {
    const { uid, groupId } = await groupWithMember();
    const imageBase64 = Buffer.alloc(MAX_IMAGE_BYTES + 1).toString('base64');

    await expect(scan(uid, { groupId, imageBase64 })).rejects.toMatchObject({
      code: 'invalid-argument',
      message: expect.stringContaining('too large'),
    });
  });
});

describe('scanReceipt: PDF receipts', () => {
  it('reads the total from a PDF with a text layer', async () => {
    const { uid, groupId } = await groupWithMember();

    const result = await scan(uid, {
      groupId,
      imageBase64: WITH_TEXT_PDF_BASE64,
    });

    expect(result).toMatchObject({ total: 4.89, tax: 0.39 });
    expect(result.rawText).toContain('Coffee Shop');
  });

  it('asks for a photo when the PDF has no text layer', async () => {
    const { uid, groupId } = await groupWithMember();

    const error = await scan(uid, {
      groupId,
      imageBase64: BLANK_PDF_BASE64,
    }).catch((e) => e);

    expect(error).toMatchObject({
      code: 'failed-precondition',
      details: { reason: 'pdf-not-readable' },
    });
  });
});
