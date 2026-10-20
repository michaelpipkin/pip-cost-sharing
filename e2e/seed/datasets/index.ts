import type { SeedDataset } from '../types';
import { AUTH_DATASET } from './auth';
import { GROUPS_DATASET } from './groups';
import { SHARED_DATASET } from './shared';

/** Every dataset global setup seeds. Spec-owned datasets register here too. */
export const ALL_DATASETS: SeedDataset[] = [
  SHARED_DATASET,
  AUTH_DATASET,
  GROUPS_DATASET,
];
