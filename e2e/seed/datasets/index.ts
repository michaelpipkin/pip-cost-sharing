import type { SeedDataset } from '../types';
import { AUTH_DATASET } from './auth';
import { EXPENSES_DATASET } from './expenses';
import { GROUPS_DATASET } from './groups';
import { HISTORY_DATASET } from './history';
import { INFRA_DATASET } from './infra';
import { PAYMENT_FLOW_DATASET } from './payment-flow';
import { RENTAL_DATASET } from './rental';
import { SHARED_DATASET } from './shared';
import { SUMMARY_DATASET } from './summary';

/** Every dataset global setup seeds. Spec-owned datasets register here too. */
export const ALL_DATASETS: SeedDataset[] = [
  SHARED_DATASET,
  AUTH_DATASET,
  GROUPS_DATASET,
  EXPENSES_DATASET,
  SUMMARY_DATASET,
  HISTORY_DATASET,
  PAYMENT_FLOW_DATASET,
  INFRA_DATASET,
  RENTAL_DATASET,
];
