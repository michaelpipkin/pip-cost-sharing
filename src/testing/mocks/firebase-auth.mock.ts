import { vi } from 'vitest';

// ──────────────────────────────────────────────
// Type definitions
// ──────────────────────────────────────────────

export interface UserInfo {
  providerId: string;
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
}

// Covers all fields accessed in user.service.ts and guards
export interface User {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
  providerData: UserInfo[];
  isAnonymous: boolean;
  metadata: { creationTime?: string; lastSignInTime?: string };
}

export interface Auth {
  currentUser: User | null;
}

export interface UserCredential {
  user: User;
  operationType: string;
  providerId: string | null;
}

// ──────────────────────────────────────────────
// Mock classes
// ──────────────────────────────────────────────

export class GoogleAuthProvider {
  static PROVIDER_ID = 'google.com';
  static credential = vi.fn().mockReturnValue({});
  addScope = vi.fn().mockReturnThis();
  providerId = 'google.com';
}

// ──────────────────────────────────────────────
// Mock constants
// ──────────────────────────────────────────────

export const browserLocalPersistence = { type: 'LOCAL' as const };

// ──────────────────────────────────────────────
// Mock functions
// ──────────────────────────────────────────────

export const getAuth: (app?: any) => Auth = vi
  .fn()
  .mockReturnValue({ currentUser: null }) as any;

export const onAuthStateChanged: (
  auth: Auth,
  nextOrObserver: (user: User | null) => void,
  onError?: (error: any) => void
) => () => void = vi.fn().mockReturnValue(vi.fn()) as any;

export const connectAuthEmulator = vi.fn() as any;

export const setPersistence: (auth: Auth, persistence: any) => Promise<void> =
  vi.fn().mockResolvedValue(undefined) as any;

export const signInWithEmailAndPassword: (
  auth: Auth,
  email: string,
  password: string
) => Promise<UserCredential> = vi.fn().mockResolvedValue({ user: {} }) as any;

export const signInWithPopup: (
  auth: Auth,
  provider: any
) => Promise<UserCredential> = vi.fn().mockResolvedValue({ user: {} }) as any;

export const signInWithCredential: (
  auth: Auth,
  credential: any
) => Promise<UserCredential> = vi.fn().mockResolvedValue({ user: {} }) as any;

export const createUserWithEmailAndPassword: (
  auth: Auth,
  email: string,
  password: string
) => Promise<UserCredential> = vi.fn().mockResolvedValue({ user: {} }) as any;

export const sendPasswordResetEmail: (
  auth: Auth,
  email: string,
  actionCodeSettings?: any
) => Promise<void> = vi.fn().mockResolvedValue(undefined) as any;

export const sendEmailVerification: (
  user: User,
  actionCodeSettings?: any
) => Promise<void> = vi.fn().mockResolvedValue(undefined) as any;

export const updateEmail: (user: User, newEmail: string) => Promise<void> = vi
  .fn()
  .mockResolvedValue(undefined) as any;

export const updatePassword: (
  user: User,
  newPassword: string
) => Promise<void> = vi.fn().mockResolvedValue(undefined) as any;

export const applyActionCode: (auth: Auth, oobCode: string) => Promise<void> =
  vi.fn().mockResolvedValue(undefined) as any;

export const confirmPasswordReset: (
  auth: Auth,
  oobCode: string,
  newPassword: string
) => Promise<void> = vi.fn().mockResolvedValue(undefined) as any;

export const fetchSignInMethodsForEmail: (
  auth: Auth,
  email: string
) => Promise<string[]> = vi.fn().mockResolvedValue([]) as any;
