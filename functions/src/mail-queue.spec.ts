import type { DocumentReference } from 'firebase-admin/firestore';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uniqueId } from './test-fixtures';

// The non-demo path builds a real SMTP transport; nodemailer is replaced so
// nothing is ever sent. The transport's sendMail is the spy every test drives.
const smtp = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(),
}));
vi.mock('nodemailer', () => {
  const createTransport = (...args: unknown[]) => smtp.createTransport(...args);
  return { createTransport, default: { createTransport } };
});

import { sendMailQueueEmail } from './index';

const db = getFirestore();
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// The `mail` collection is global and other specs write to it: each test
// creates its own doc and only ever reads that doc back.
async function queue(doc: Record<string, unknown>) {
  const ref = db.collection('mail').doc(uniqueId('mail'));
  await ref.set(doc);
  return ref;
}

async function deliver(ref: DocumentReference) {
  const snap = await ref.get();
  await (sendMailQueueEmail as any).run({
    data: snap,
    params: { docId: ref.id },
  });
  return ref.get();
}

const message = { subject: 'Hello', text: 'plain', html: '<p>html</p>' };

beforeEach(() => {
  smtp.sendMail.mockReset();
  smtp.createTransport.mockReset();
  smtp.createTransport.mockReturnValue({ sendMail: smtp.sendMail });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('sendMailQueueEmail: documents it leaves alone', () => {
  it('skips a doc that already has a delivery result', async () => {
    const delivery = { state: 'SUCCESS', attempts: 1 };
    const ref = await queue({ to: 'a@mail-queue.test', message, delivery });
    const before = await ref.get();

    const after = await deliver(ref);

    expect(after.data()).toEqual(before.data());
    expect(after.updateTime!.isEqual(before.updateTime!)).toBe(true);
    expect(smtp.sendMail).not.toHaveBeenCalled();
  });

  it('skips a doc with no recipient', async () => {
    const ref = await queue({ message });
    const before = await ref.get();

    const after = await deliver(ref);

    expect(after.data()).toEqual({ message });
    expect(after.updateTime!.isEqual(before.updateTime!)).toBe(true);
  });

  it('skips a doc with no subject', async () => {
    const ref = await queue({
      to: 'a@mail-queue.test',
      message: { text: 'body only' },
    });
    const before = await ref.get();

    const after = await deliver(ref);

    expect(after.get('delivery')).toBeUndefined();
    expect(after.updateTime!.isEqual(before.updateTime!)).toBe(true);
  });

  it('skips a doc with no message at all', async () => {
    const ref = await queue({ to: 'a@mail-queue.test' });

    expect((await deliver(ref)).get('delivery')).toBeUndefined();
  });

  it('does nothing when the event carries no snapshot', async () => {
    await expect(
      (sendMailQueueEmail as any).run({
        data: undefined,
        params: { docId: 'x' },
      })
    ).resolves.toBeUndefined();
  });
});

describe('sendMailQueueEmail: demo project (the isolated emulators)', () => {
  it('records a suppressed SUCCESS delivery and sends nothing', async () => {
    const to = ['a@mail-queue.test', 'b@mail-queue.test'];
    const ref = await queue({ to, message });
    const before = Date.now();

    const snap = await deliver(ref);

    const delivery = snap.get('delivery');
    expect(delivery.state).toBe('SUCCESS');
    expect(delivery.attempts).toBe(1);
    expect(delivery.info).toEqual({
      messageId: 'suppressed',
      accepted: to,
      rejected: [],
      response: 'suppressed: demo project',
    });
    expect(delivery.startTime).toBeInstanceOf(Timestamp);
    expect(delivery.endTime.toMillis()).toBeGreaterThanOrEqual(
      delivery.startTime.toMillis()
    );
    const expireAt = snap.get('expireAt') as Timestamp;
    expect(Math.abs(expireAt.toMillis() - (before + YEAR_MS))).toBeLessThan(
      60_000
    );
    expect(smtp.createTransport).not.toHaveBeenCalled();
    expect(smtp.sendMail).not.toHaveBeenCalled();
  });

  it('accepts a single recipient string', async () => {
    const ref = await queue({ to: 'solo@mail-queue.test', message });

    expect((await deliver(ref)).get('delivery.info.accepted')).toEqual([
      'solo@mail-queue.test',
    ]);
  });

  // Regression for B8: the suppressed-delivery write used to sit outside the
  // try/catch that guards the real send, so a failing write rejected the whole
  // handler and left the doc stuck in PROCESSING. Only the suppressed write
  // (update call 2, after the PROCESSING write) fails; the catch then records
  // an ERROR delivery.
  it('catches a failure while writing the suppressed delivery', async () => {
    const ref = await queue({ to: 'a@mail-queue.test', message });
    const snap = await ref.get();
    const realUpdate = snap.ref.update.bind(snap.ref);
    let calls = 0;
    vi.spyOn(snap.ref, 'update').mockImplementation((...args: any[]) => {
      calls++;
      return calls === 2
        ? Promise.reject(new Error('write failed'))
        : (realUpdate as any)(...args);
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      (sendMailQueueEmail as any).run({ data: snap, params: { docId: ref.id } })
    ).resolves.toBeUndefined();
    // The doc must not be left stuck in PROCESSING.
    expect((await ref.get()).get('delivery.state')).not.toBe('PROCESSING');
    const delivery = (await ref.get()).get('delivery');
    expect(delivery.state).toBe('ERROR');
    expect(delivery.error).toBe('write failed');
    expect(delivery.attempts).toBe(1);
  });

  // The catch's own ERROR write was not guarded, so when it failed too
  // the handler rejected and the doc stayed PROCESSING. It is now tried a
  // second time. Failing calls 2 and 3 fails the suppressed write and the
  // first ERROR write; call 4 (the retry) goes through.
  it('retries the ERROR write once when it fails', async () => {
    const ref = await queue({ to: 'a@mail-queue.test', message });
    const snap = await ref.get();
    const realUpdate = snap.ref.update.bind(snap.ref);
    let calls = 0;
    vi.spyOn(snap.ref, 'update').mockImplementation((...args: any[]) => {
      calls++;
      return calls === 2 || calls === 3
        ? Promise.reject(new Error(`write ${calls} failed`))
        : (realUpdate as any)(...args);
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      (sendMailQueueEmail as any).run({ data: snap, params: { docId: ref.id } })
    ).resolves.toBeUndefined();
    expect(calls).toBe(4);
    const delivery = (await ref.get()).get('delivery');
    expect(delivery.state).toBe('ERROR');
    expect(delivery.error).toBe('write 2 failed');
  });

  // When the retry fails as well, nothing more can be written: the handler
  // logs it and still ends cleanly (no unhandled rejection). The doc is left
  // PROCESSING, which is all the emulator can show for this case.
  it('logs and ends cleanly when the ERROR write fails twice', async () => {
    const ref = await queue({ to: 'a@mail-queue.test', message });
    const snap = await ref.get();
    const realUpdate = snap.ref.update.bind(snap.ref);
    let calls = 0;
    vi.spyOn(snap.ref, 'update').mockImplementation((...args: any[]) => {
      calls++;
      return calls === 1
        ? (realUpdate as any)(...args)
        : Promise.reject(new Error(`write ${calls} failed`));
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      (sendMailQueueEmail as any).run({ data: snap, params: { docId: ref.id } })
    ).resolves.toBeUndefined();
    expect(calls).toBe(4);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        `Could not record the ERROR delivery for mail doc ${ref.id}`
      ),
      expect.objectContaining({ message: 'write 4 failed' })
    );
  });
});

describe('sendMailQueueEmail: real project (nodemailer mocked)', () => {
  beforeEach(() => {
    vi.stubEnv('GCLOUD_PROJECT', 'pipsplit');
  });

  it('sends with the PipSplit from and reply-to, then ends at SUCCESS', async () => {
    const to = ['a@mail-queue.test', 'b@mail-queue.test'];
    const ref = await queue({ to, message });
    smtp.sendMail.mockResolvedValue({
      messageId: '<id@pipsplit.com>',
      accepted: to,
      rejected: [],
      response: '250 2.0.0 OK',
    });
    const before = Date.now();

    const snap = await deliver(ref);

    expect(smtp.sendMail).toHaveBeenCalledTimes(1);
    expect(smtp.sendMail).toHaveBeenCalledWith({
      from: 'PipSplit <admin@pipsplit.com>',
      replyTo: 'no-reply@pipsplit.com',
      to,
      subject: 'Hello',
      text: 'plain',
      html: '<p>html</p>',
    });
    const delivery = snap.get('delivery');
    expect(delivery.state).toBe('SUCCESS');
    expect(delivery.attempts).toBe(1);
    expect(delivery.info).toEqual({
      messageId: '<id@pipsplit.com>',
      accepted: to,
      rejected: [],
      response: '250 2.0.0 OK',
    });
    const expireAt = snap.get('expireAt') as Timestamp;
    expect(Math.abs(expireAt.toMillis() - (before + YEAR_MS))).toBeLessThan(
      60_000
    );
  });

  it('connects to the Office 365 submission endpoint with STARTTLS', async () => {
    const ref = await queue({ to: 'a@mail-queue.test', message });
    smtp.sendMail.mockResolvedValue({});

    await deliver(ref);

    expect(smtp.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.office365.com',
        port: 587,
        secure: false,
        requireTLS: true,
        auth: expect.objectContaining({ user: 'admin@pipsplit.com' }),
      })
    );
  });

  it('marks the doc PROCESSING before it sends', async () => {
    const ref = await queue({ to: 'a@mail-queue.test', message });
    let stateDuringSend: unknown;
    let attemptsDuringSend: unknown;
    smtp.sendMail.mockImplementation(async () => {
      const mid = await ref.get();
      stateDuringSend = mid.get('delivery.state');
      attemptsDuringSend = mid.get('delivery.attempts');
      return { messageId: 'm', accepted: [], rejected: [], response: 'ok' };
    });

    const snap = await deliver(ref);

    expect(stateDuringSend).toBe('PROCESSING');
    expect(attemptsDuringSend).toBe(1);
    expect(snap.get('delivery.state')).toBe('SUCCESS');
  });

  it('falls back to empty strings and arrays when the transport reports no info', async () => {
    const ref = await queue({ to: 'a@mail-queue.test', message });
    smtp.sendMail.mockResolvedValue({});

    expect((await deliver(ref)).get('delivery.info')).toEqual({
      messageId: '',
      accepted: [],
      rejected: [],
      response: '',
    });
  });

  it('records an ERROR with the message and attempts: 1 when sendMail rejects', async () => {
    const ref = await queue({ to: 'a@mail-queue.test', message });
    smtp.sendMail.mockRejectedValue(new Error('550 mailbox unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const before = Date.now();

    const snap = await deliver(ref);

    const delivery = snap.get('delivery');
    expect(delivery.state).toBe('ERROR');
    expect(delivery.attempts).toBe(1);
    expect(delivery.error).toBe('550 mailbox unavailable');
    expect(delivery.startTime).toBeInstanceOf(Timestamp);
    expect(delivery.endTime).toBeInstanceOf(Timestamp);
    expect(delivery.info).toBeUndefined();
    expect(
      Math.abs(
        (snap.get('expireAt') as Timestamp).toMillis() - (before + YEAR_MS)
      )
    ).toBeLessThan(60_000);
  });

  it('stringifies a rejection that is not an Error', async () => {
    const ref = await queue({ to: 'a@mail-queue.test', message });
    smtp.sendMail.mockRejectedValue('plain string failure');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect((await deliver(ref)).get('delivery.error')).toBe(
      'plain string failure'
    );
  });

  it('records an ERROR when the transport cannot be built', async () => {
    const ref = await queue({ to: 'a@mail-queue.test', message });
    smtp.createTransport.mockImplementation(() => {
      throw new Error('bad smtp config');
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const delivery = (await deliver(ref)).get('delivery');

    expect(delivery.state).toBe('ERROR');
    expect(delivery.error).toBe('bad smtp config');
  });
});
