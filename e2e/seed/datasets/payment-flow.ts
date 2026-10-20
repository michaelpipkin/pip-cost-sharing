import { seedDaysAgo } from '../dates';
import type { SeedDataset, SeedGroup, SeedUser } from '../types';

/**
 * Owned by e2e/critical-flows/expense-to-payment-flow.spec.ts. One group per
 * test, each the only (and default) group of its own signing-in user, so
 * sign-in lands on it and no test switches groups (selecting a group
 * rewrites the user's defaultGroupRef).
 *
 * - flow-user, only in "Flow – Pay" (auto-add on): Pia (the user) and Quinn
 *   (placeholder). Categories Food and Fuel. Seeded, unpaid: "Flow – Pay
 *   seeded fuel" (Pia paid 40.00: Pia 20 self, Quinn 20). The pay test adds a
 *   Food expense through the form, pays Quinn -> Pia and copies the payment.
 * - flow-cancel, only in "Flow – Cancel" (read-only: the payment dialog is
 *   only ever cancelled): Cora (the user) and Remy (placeholder). Seeded,
 *   unpaid: "Flow – Cancel taxi" (Remy paid 24.00: Cora 12, Remy 12 self), so
 *   Cora owes Remy 12.00. No payments.
 * - flow-method, only in "Flow – Method": Mae (the user) and Nico, linked to
 *   flow-payee, whose Venmo and Zelle IDs the payment dialog lists. Seeded,
 *   unpaid: "Flow – Method concert" (Nico paid 80.00: Mae 40, Nico 40 self),
 *   so Mae owes Nico 40.00.
 * - flow-mutual, only in "Flow – Mutual": Max (the user) and Nell
 *   (placeholder), with debts both ways: "Flow – Mutual cabin" (Lodging, Max
 *   paid 100.00: Max 50 self, Nell 50) and "Flow – Mutual dinner" (Dining,
 *   Nell paid 30.00: Max 30). Net: Nell owes Max 20.00 (Lodging +50, Dining
 *   -30).
 *
 * Payment mail (sendPaymentNotificationEmail) goes to the payer and payee
 * members linked to a user. Every linked member here is one of this
 * dataset's users (flow-user, flow-method, flow-payee, flow-mutual; all
 * @pipsplit.test), and the other members are placeholders without an
 * account, so a payment recorded by the spec can only mail these users.
 * flow-payee never signs in.
 */

const SPEC = 'spec:e2e/critical-flows/expense-to-payment-flow.spec.ts' as const;
const PASSWORD = 'Seed-Pass-123!';

const flowUser: SeedUser = {
  key: 'flow-user',
  uid: 'u-flow-user',
  email: 'flow-user@pipsplit.test',
  password: PASSWORD,
  profile: { defaultGroupKey: 'g-flow-pay' },
};

const cancelUser: SeedUser = {
  key: 'flow-cancel',
  uid: 'u-flow-cancel',
  email: 'flow-cancel@pipsplit.test',
  password: PASSWORD,
  profile: { defaultGroupKey: 'g-flow-cancel' },
};

const methodUser: SeedUser = {
  key: 'flow-method',
  uid: 'u-flow-method',
  email: 'flow-method@pipsplit.test',
  password: PASSWORD,
  profile: { defaultGroupKey: 'g-flow-method' },
};

/** The Method group's payee; only its saved payment IDs matter. */
const payeeUser: SeedUser = {
  key: 'flow-payee',
  uid: 'u-flow-payee',
  email: 'flow-payee@pipsplit.test',
  password: PASSWORD,
  profile: {
    venmoId: 'flow-payee-venmo',
    zelleId: 'flow-payee-zelle',
    defaultGroupKey: 'g-flow-method',
  },
};

const mutualUser: SeedUser = {
  key: 'flow-mutual',
  uid: 'u-flow-mutual',
  email: 'flow-mutual@pipsplit.test',
  password: PASSWORD,
  profile: { defaultGroupKey: 'g-flow-mutual' },
};

const pay: SeedGroup = {
  key: 'g-flow-pay',
  owner: SPEC,
  name: 'Flow – Pay',
  autoAddMembers: true,
  members: [
    {
      key: 'pia',
      displayName: 'Pia',
      email: flowUser.email,
      userKey: flowUser.key,
      groupAdmin: true,
    },
    { key: 'quinn', displayName: 'Quinn', email: '' },
  ],
  categories: [
    { key: 'food', name: 'Food' },
    { key: 'fuel', name: 'Fuel' },
  ],
  expenses: [
    {
      key: 'e-flow-pay-fuel',
      date: seedDaysAgo(4),
      description: 'Flow – Pay seeded fuel',
      categoryKey: 'fuel',
      paidByKey: 'pia',
      totalAmount: 40,
      splitMethod: 'amount',
      splits: [
        { owedByKey: 'pia', assignedAmount: 20 },
        { owedByKey: 'quinn', assignedAmount: 20 },
      ],
    },
  ],
};

const cancel: SeedGroup = {
  key: 'g-flow-cancel',
  owner: SPEC,
  name: 'Flow – Cancel',
  members: [
    {
      key: 'cora',
      displayName: 'Cora',
      email: cancelUser.email,
      userKey: cancelUser.key,
      groupAdmin: true,
    },
    { key: 'remy', displayName: 'Remy', email: '' },
  ],
  categories: [{ key: 'transport', name: 'Transport' }],
  expenses: [
    {
      key: 'e-flow-cancel-taxi',
      date: seedDaysAgo(3),
      description: 'Flow – Cancel taxi',
      categoryKey: 'transport',
      paidByKey: 'remy',
      totalAmount: 24,
      splitMethod: 'amount',
      splits: [
        { owedByKey: 'cora', assignedAmount: 12 },
        { owedByKey: 'remy', assignedAmount: 12 },
      ],
    },
  ],
};

const method: SeedGroup = {
  key: 'g-flow-method',
  owner: SPEC,
  name: 'Flow – Method',
  members: [
    {
      key: 'mae',
      displayName: 'Mae',
      email: methodUser.email,
      userKey: methodUser.key,
      groupAdmin: true,
    },
    {
      key: 'nico',
      displayName: 'Nico',
      email: payeeUser.email,
      userKey: payeeUser.key,
    },
  ],
  categories: [{ key: 'tickets', name: 'Tickets' }],
  expenses: [
    {
      key: 'e-flow-method-concert',
      date: seedDaysAgo(5),
      description: 'Flow – Method concert',
      categoryKey: 'tickets',
      paidByKey: 'nico',
      totalAmount: 80,
      splitMethod: 'amount',
      splits: [
        { owedByKey: 'mae', assignedAmount: 40 },
        { owedByKey: 'nico', assignedAmount: 40 },
      ],
    },
  ],
};

const mutual: SeedGroup = {
  key: 'g-flow-mutual',
  owner: SPEC,
  name: 'Flow – Mutual',
  members: [
    {
      key: 'max',
      displayName: 'Max',
      email: mutualUser.email,
      userKey: mutualUser.key,
      groupAdmin: true,
    },
    { key: 'nell', displayName: 'Nell', email: '' },
  ],
  categories: [
    { key: 'dining', name: 'Dining' },
    { key: 'lodging', name: 'Lodging' },
  ],
  expenses: [
    {
      key: 'e-flow-mutual-cabin',
      date: seedDaysAgo(8),
      description: 'Flow – Mutual cabin',
      categoryKey: 'lodging',
      paidByKey: 'max',
      totalAmount: 100,
      splitMethod: 'amount',
      splits: [
        { owedByKey: 'max', assignedAmount: 50 },
        { owedByKey: 'nell', assignedAmount: 50 },
      ],
    },
    {
      key: 'e-flow-mutual-dinner',
      date: seedDaysAgo(6),
      description: 'Flow – Mutual dinner',
      categoryKey: 'dining',
      paidByKey: 'nell',
      totalAmount: 30,
      splitMethod: 'amount',
      splits: [{ owedByKey: 'max', assignedAmount: 30 }],
    },
  ],
};

export const PAYMENT_FLOW = {
  users: { flowUser, cancelUser, methodUser, payeeUser, mutualUser },
  groups: { pay, cancel, method, mutual },
} as const;

export const PAYMENT_FLOW_DATASET: SeedDataset = {
  name: 'payment-flow',
  users: Object.values(PAYMENT_FLOW.users),
  groups: Object.values(PAYMENT_FLOW.groups),
};
