/**
 * Shared Firebase Admin SDK initialization for scripts that write to the
 * LOCAL FIRESTORE EMULATOR ONLY (seed / prune tooling).
 *
 * Safety: the Firestore, Auth and Storage emulator hosts are all forced before
 * firebase-admin is initialized, so these scripts can never reach production
 * Firestore, Auth or Storage regardless of local ADC configuration. If the
 * emulators aren't running, the calls below simply fail to connect
 * (127.0.0.1:8080 refused) rather than falling back to a real project.
 * These deliberately target the owner's DEV emulators on the default ports,
 * never the isolated test emulators.
 *
 * Deliberately separate from lib.ts, which initializes against production
 * ADC for the read-only query scripts in queries/ — the two must never be
 * importable from the same call site.
 */
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: 'pip-cost-sharing' });

export const db = getFirestore();

export function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min; // NOSONAR - seed data, not security-sensitive
}

export function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min; // NOSONAR - seed data, not security-sensitive
}

export function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)]!;
}

export function shuffled<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5); // NOSONAR - seed data, not security-sensitive
}

// Allocation helpers live in allocation.ts (side-effect free); re-exported here so
// existing imports from this module keep working.
export * from './allocation.ts';

