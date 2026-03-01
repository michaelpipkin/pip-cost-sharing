import { vi } from 'vitest';

// Global module mocks for Firebase packages.
// These must live in a setupFiles entry (not in spec files) because the
// Angular unit-test runner blocks vi.mock() calls inside spec files, and
// Firebase ESM module namespace exports are non-configurable so vi.spyOn()
// alone cannot intercept them. By mocking here first, every imported export
// becomes a configurable vi.fn() that individual tests can override with
// vi.spyOn(...).mockReturnValueOnce(…) / mockResolvedValueOnce(…).

vi.mock('firebase/firestore', () => ({
  collection: vi.fn().mockReturnValue({}),
  collectionGroup: vi.fn().mockReturnValue({}),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  getFirestore: vi.fn(),
  query: vi.fn().mockReturnValue({}),
  where: vi.fn().mockReturnValue({}),
  orderBy: vi.fn().mockReturnValue({}),
  limit: vi.fn().mockReturnValue({}),
  documentId: vi.fn().mockReturnValue({}),
  onSnapshot: vi.fn().mockReturnValue(vi.fn()),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
  setDoc: vi.fn(),
  Timestamp: class {
    toIsoDateString = () => '2025-01-01';
  },
}));

vi.mock('firebase/auth', () => ({
  browserLocalPersistence: {},
  getAuth: vi.fn(),
  setPersistence: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('firebase/storage', () => ({
  deleteObject: vi.fn().mockResolvedValue(undefined),
  getStorage: vi.fn(),
  ref: vi.fn(),
  uploadBytes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}));
