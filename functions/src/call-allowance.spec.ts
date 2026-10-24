import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import {
  consumeAllowance,
  deleteExpiredAllowanceWindows,
  refundAllowance,
} from './call-allowance';
// Importing from index initialises the Admin SDK.
import './index';
import { uniqueId } from './test-fixtures';

const db = getFirestore();
const COLLECTION = 'callAllowanceTestLimits';
const WINDOW_MS = 60 * 60 * 1000;
const MESSAGE = 'Used up for this window.';

function options(uid: string, nowMs: number, limit = 3) {
  return {
    collection: COLLECTION,
    uid,
    limit,
    windowMs: WINDOW_MS,
    nowMs,
    exhaustedMessage: MESSAGE,
  };
}

async function countOf(uid: string): Promise<number | undefined> {
  return (await db.collection(COLLECTION).doc(uid).get()).get('count');
}

describe('consumeAllowance', () => {
  it('allows calls up to the limit, then refuses with the message', async () => {
    const uid = uniqueId('u');
    const nowMs = Date.now();
    for (let i = 0; i < 3; i++) {
      await consumeAllowance(db, options(uid, nowMs));
    }
    expect(await countOf(uid)).toBe(3);
    await expect(
      consumeAllowance(db, options(uid, nowMs))
    ).rejects.toMatchObject({ code: 'resource-exhausted', message: MESSAGE });
    expect(await countOf(uid)).toBe(3);
  });

  it('starts a new window once the old one has ended', async () => {
    const uid = uniqueId('u');
    const nowMs = Date.now();
    for (let i = 0; i < 3; i++) {
      await consumeAllowance(db, options(uid, nowMs));
    }
    await consumeAllowance(db, options(uid, nowMs + WINDOW_MS));
    const snap = await db.collection(COLLECTION).doc(uid).get();
    expect(snap.get('count')).toBe(1);
    expect((snap.get('windowStart') as Timestamp).toMillis()).toBe(
      nowMs + WINDOW_MS
    );
  });

  it('counts each uid separately', async () => {
    const nowMs = Date.now();
    await consumeAllowance(db, options(uniqueId('u'), nowMs, 1));
    await expect(
      consumeAllowance(db, options(uniqueId('u'), nowMs, 1))
    ).resolves.toBeUndefined();
  });
});

describe('refundAllowance', () => {
  it('gives one call back in the current window', async () => {
    const uid = uniqueId('u');
    const nowMs = Date.now();
    await consumeAllowance(db, options(uid, nowMs, 1));
    await refundAllowance(db, options(uid, nowMs));
    expect(await countOf(uid)).toBe(0);
    await consumeAllowance(db, options(uid, nowMs, 1));
    expect(await countOf(uid)).toBe(1);
  });

  it('leaves a missing doc alone', async () => {
    const uid = uniqueId('u');
    await refundAllowance(db, options(uid, Date.now()));
    expect((await db.collection(COLLECTION).doc(uid).get()).exists).toBe(false);
  });

  it('never goes below zero', async () => {
    const uid = uniqueId('u');
    const nowMs = Date.now();
    await consumeAllowance(db, options(uid, nowMs, 1));
    await refundAllowance(db, options(uid, nowMs));
    await refundAllowance(db, options(uid, nowMs));
    expect(await countOf(uid)).toBe(0);
  });

  it('leaves a window that started after the charged call alone', async () => {
    const uid = uniqueId('u');
    const nowMs = Date.now();
    await consumeAllowance(db, options(uid, nowMs + WINDOW_MS, 5));
    await refundAllowance(db, options(uid, nowMs));
    expect(await countOf(uid)).toBe(1);
  });
});

describe('deleteExpiredAllowanceWindows', () => {
  it('deletes ended windows and keeps live ones', async () => {
    const nowMs = Date.now();
    const ended = db.collection(COLLECTION).doc(uniqueId('ended'));
    const live = db.collection(COLLECTION).doc(uniqueId('live'));
    await ended.set({
      windowStart: Timestamp.fromMillis(nowMs - WINDOW_MS - 1000),
      count: 2,
    });
    await live.set({
      windowStart: Timestamp.fromMillis(nowMs - 1000),
      count: 2,
    });
    const deleted = await deleteExpiredAllowanceWindows(
      db,
      COLLECTION,
      WINDOW_MS,
      nowMs
    );
    // Other tests' ended windows may be deleted too.
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect((await ended.get()).exists).toBe(false);
    expect((await live.get()).exists).toBe(true);
  });
});
