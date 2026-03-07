import { vi } from 'vitest';

// ──────────────────────────────────────────────
// Minimal type definitions compatible with real Firebase
// (doc-ref-extensions.ts and timestamp-extensions.ts augment these via
//  `declare module 'firebase/firestore'`, which now points to this file)
// ──────────────────────────────────────────────

// Must be a class (not a type alias) so `declare module` interface augmentation
// can merge with it and DocumentReference.prototype.eq = ... works at runtime.
export class DocumentReference<T = unknown> {
  parent!: CollectionReference<T>;
  constructor(
    public id: string = '',
    public path: string = ''
  ) {}
}

export class Timestamp {
  constructor(
    public seconds: number = 0,
    public nanoseconds: number = 0
  ) {}
  static fromDate = vi
    .fn()
    .mockImplementation(
      (d: Date) => new Timestamp(Math.floor(d.getTime() / 1000), 0)
    );
  static now = vi
    .fn()
    .mockImplementation(() => new Timestamp(Math.floor(Date.now() / 1000), 0));
  toDate = vi.fn().mockReturnValue(new Date());
  toMillis = vi.fn().mockReturnValue(0);
}

export interface QueryDocumentSnapshot<T = unknown> {
  id: string;
  ref: DocumentReference<T>;
  data(): T;
  exists(): true;
}

export interface QuerySnapshot<T = unknown> {
  docs: QueryDocumentSnapshot<T>[];
  size: number;
  empty: boolean;
  forEach(callback: (result: QueryDocumentSnapshot<T>) => void): void;
}

export interface DocumentSnapshot<T = unknown> {
  id: string;
  ref: DocumentReference<T>;
  exists(): boolean;
  data(): T | undefined;
}

// Opaque types — services receive these but only pass them around
export interface CollectionReference<T = unknown> {
  id: string;
  path: string;
  parent: DocumentReference<T> | null;
}
export interface Query<T = unknown> {
  _ref?: CollectionReference<T>;
}
export interface FieldPath {}
export interface QueryConstraint {}
export type WhereFilterOp =
  | '<'
  | '<='
  | '=='
  | '!='
  | '>='
  | '>'
  | 'in'
  | 'not-in'
  | 'array-contains'
  | 'array-contains-any';
export type OrderByDirection = 'asc' | 'desc';

// ──────────────────────────────────────────────
// Mock functions — all are vi.fn() instances so vi.spyOn / direct config works
// ──────────────────────────────────────────────

export const getFirestore = vi.fn().mockReturnValue({});

export const collection: (
  db: any,
  path: string,
  ...pathSegments: string[]
) => CollectionReference<unknown> = vi.fn().mockReturnValue({}) as any;

export const collectionGroup: (
  db: any,
  collectionId: string
) => Query<unknown> = vi.fn().mockReturnValue({}) as any;

export const doc: (...args: any[]) => DocumentReference<unknown> = vi
  .fn()
  .mockReturnValue(new DocumentReference()) as any;

export const documentId: () => FieldPath = vi.fn().mockReturnValue({}) as any;

export const query: (
  queryOrRef: any,
  ...constraints: QueryConstraint[]
) => Query<unknown> = vi.fn().mockReturnValue({}) as any;

export const where: (
  field: string | FieldPath,
  op: WhereFilterOp,
  value: any
) => QueryConstraint = vi.fn().mockReturnValue({}) as any;

export const orderBy: (
  field: string | FieldPath,
  direction?: OrderByDirection
) => QueryConstraint = vi.fn().mockReturnValue({}) as any;

export const limit: (n: number) => QueryConstraint = vi
  .fn()
  .mockReturnValue({}) as any;

export const onSnapshot: (
  queryOrRef: any,
  onNext: (snap: QuerySnapshot<any>) => void,
  onError?: (error: any) => void
) => () => void = vi.fn().mockReturnValue(vi.fn()) as any;

export const getDocs: (
  query: Query<any> | CollectionReference<any>
) => Promise<QuerySnapshot<any>> = vi.fn().mockResolvedValue({
  docs: [],
  size: 0,
  empty: true,
  forEach: vi.fn(),
}) as any;

export const getDoc: (
  ref: DocumentReference<any>
) => Promise<DocumentSnapshot<any>> = vi.fn().mockResolvedValue({
  id: '',
  exists: () => false,
  data: () => undefined,
}) as any;

export const addDoc: (
  ref: CollectionReference<any>,
  data: any
) => Promise<DocumentReference<any>> = vi
  .fn()
  .mockResolvedValue(new DocumentReference('mock-id')) as any;

export const updateDoc: (
  ref: DocumentReference<any>,
  data: any
) => Promise<void> = vi.fn().mockResolvedValue(undefined) as any;

export const deleteDoc: (ref: DocumentReference<any>) => Promise<void> = vi
  .fn()
  .mockResolvedValue(undefined) as any;

export const setDoc: (
  ref: DocumentReference<any>,
  data: any,
  options?: any
) => Promise<void> = vi.fn().mockResolvedValue(undefined) as any;

export const writeBatch: (db: any) => {
  set(ref: any, data: any, options?: any): void;
  update(ref: any, data: any): void;
  delete(ref: any): void;
  commit(): Promise<void>;
} = vi.fn().mockReturnValue({
  set: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
}) as any;

export const connectFirestoreEmulator = vi.fn() as any;
