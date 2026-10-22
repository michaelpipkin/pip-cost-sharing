import type { SeedDataset } from '../types';
import { ACCOUNT_DATASET } from './account';
import { ACCOUNT_ACTION_DATASET } from './account-action';
import { ADMIN_DATASET } from './admin';
import { AUTH_DATASET } from './auth';
import { CATEGORIES_DATASET } from './categories';
import { EMAIL_RULES_DATASET } from './email-rules';
import { EXPENSES_DATASET } from './expenses';
import { GROUPS_DATASET } from './groups';
import { HISTORY_DATASET } from './history';
import { INFRA_DATASET } from './infra';
import { INVITES_DATASET } from './invites';
import { MEMBER_RULES_DATASET } from './member-rules';
import { MEMBERS_DATASET } from './members';
import { MEMORIZED_DATASET } from './memorized';
import { PAYMENT_FLOW_DATASET } from './payment-flow';
import { RECEIPTS_DATASET } from './receipts';
import { RENTAL_DATASET } from './rental';
import { SHARED_DATASET } from './shared';
import { SUMMARY_DATASET } from './summary';
import { TOURS_DATASET } from './tours';
import { USER_RULES_DATASET } from './user-rules';

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
  MEMORIZED_DATASET,
  RECEIPTS_DATASET,
  ACCOUNT_DATASET,
  ACCOUNT_ACTION_DATASET,
  CATEGORIES_DATASET,
  MEMBERS_DATASET,
  INVITES_DATASET,
  TOURS_DATASET,
  ADMIN_DATASET,
  EMAIL_RULES_DATASET,
  USER_RULES_DATASET,
  MEMBER_RULES_DATASET,
];
