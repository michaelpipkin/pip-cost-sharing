import type { SeedDataset } from '../types';
import { SHARED_DATASET } from './shared';

/** Every dataset global setup seeds. Spec-owned datasets register here too. */
export const ALL_DATASETS: SeedDataset[] = [SHARED_DATASET];
