import { randomUUID } from 'node:crypto';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { verifiedEmailId } from './email-identity';
// Side-effect import: index.ts calls initializeApp() at module scope, which
// getFirestore() below needs.
import './index';
import {
  addressesOf,
  ownerOf,
  removeAllFor,
  upsertVerifiedEmail,
  VERIFIED_EMAILS,
} from './verified-emails';

const db = getFirestore();

const randomAddress = () => `Verified-${randomUUID()}@Example.com`;

describe('verifiedEmailId', () => {
  it('lowercases the address', () => {
    expect(verifiedEmailId('Ann@Example.com')).toBe('ann@example.com');
  });

  it('escapes % and / so the id is a single path segment', () => {
    expect(verifiedEmailId('a/b%c@x.com')).toBe('a%2Fb%25c@x.com');
  });

  it('lowercases first, then escapes % before /', () => {
    expect(verifiedEmailId('%2F@x.com')).toBe('%252f@x.com');
  });
});

describe('verified-emails index', () => {
  it('records the owner under any casing of the address', async () => {
    const address = randomAddress();
    const uid = randomUUID();

    await upsertVerifiedEmail(db, address, uid, 'login');

    expect(await ownerOf(db, address)).toBe(uid);
    expect(await ownerOf(db, address.toUpperCase())).toBe(uid);
    expect(await ownerOf(db, address.toLowerCase())).toBe(uid);

    const doc = await db
      .collection(VERIFIED_EMAILS)
      .doc(verifiedEmailId(address))
      .get();
    const data = doc.data()!;
    expect(data['uid']).toBe(uid);
    expect(data['email']).toBe(address.toLowerCase());
    expect(data['source']).toBe('login');
    expect(data['verifiedAt']).toBeInstanceOf(Timestamp);
  });

  it('round-trips an address containing /, %, + and capitals (RF 1)', async () => {
    const address = `Ann/B+c%d-${randomUUID()}@Example.com`;
    const uid = randomUUID();

    await upsertVerifiedEmail(db, address, uid, 'group-confirm');

    expect(await ownerOf(db, address)).toBe(uid);
    expect(await ownerOf(db, address.toLowerCase())).toBe(uid);
    expect(await addressesOf(db, uid)).toEqual([address.toLowerCase()]);
  });

  it('returns null for an address nobody has proven', async () => {
    expect(await ownerOf(db, randomAddress())).toBeNull();
  });

  it('lets a later proof take the address over', async () => {
    const address = randomAddress();
    const uidA = randomUUID();
    const uidB = randomUUID();

    await upsertVerifiedEmail(db, address, uidA, 'login');
    await upsertVerifiedEmail(db, address, uidB, 'group-confirm');

    expect(await ownerOf(db, address)).toBe(uidB);
    expect(await addressesOf(db, uidA)).toEqual([]);
    expect(await addressesOf(db, uidB)).toEqual([address.toLowerCase()]);
  });

  it("addressesOf returns exactly that uid's addresses", async () => {
    const uid = randomUUID();
    const otherUid = randomUUID();
    const first = randomAddress();
    const second = randomAddress();
    await upsertVerifiedEmail(db, first, uid, 'login');
    await upsertVerifiedEmail(db, second, uid, 'group-confirm');
    await upsertVerifiedEmail(db, randomAddress(), otherUid, 'login');

    const addresses = await addressesOf(db, uid);

    expect(addresses.sort()).toEqual(
      [first.toLowerCase(), second.toLowerCase()].sort()
    );
  });

  it("removeAllFor deletes that uid's entries and leaves other uids' alone", async () => {
    const uid = randomUUID();
    const otherUid = randomUUID();
    const mine1 = randomAddress();
    const mine2 = randomAddress();
    const theirs = randomAddress();
    await upsertVerifiedEmail(db, mine1, uid, 'login');
    await upsertVerifiedEmail(db, mine2, uid, 'group-confirm');
    await upsertVerifiedEmail(db, theirs, otherUid, 'login');

    expect(await removeAllFor(db, uid)).toBe(2);

    expect(await ownerOf(db, mine1)).toBeNull();
    expect(await ownerOf(db, mine2)).toBeNull();
    expect(await ownerOf(db, theirs)).toBe(otherUid);
    expect(await removeAllFor(db, uid)).toBe(0);
  });

  it('writes inside a transaction and commits with it', async () => {
    const address = randomAddress();
    const uid = randomUUID();

    await db.runTransaction(async (txn) => {
      await upsertVerifiedEmail(db, address, uid, 'login', txn);
    });

    expect(await ownerOf(db, address)).toBe(uid);
  });

  it('writes nothing when the transaction aborts', async () => {
    const address = randomAddress();
    const uid = randomUUID();

    await expect(
      db.runTransaction(async (txn) => {
        await upsertVerifiedEmail(db, address, uid, 'login', txn);
        throw new Error('abort');
      })
    ).rejects.toThrow('abort');

    expect(await ownerOf(db, address)).toBeNull();
  });
});
