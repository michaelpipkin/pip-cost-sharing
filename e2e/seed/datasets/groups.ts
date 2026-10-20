import type { SeedDataset, SeedGroup, SeedUser } from '../types';

/**
 * Owned by e2e/groups/groups-admin.spec.ts.
 *
 * - groups-empty: no groups. Read-only: no test may create a group as this
 *   user (the empty-state, validation and cancel tests rely on it staying
 *   empty).
 * - groups-creator: no seeded groups. Creation tests sign in as this user and
 *   create groups with unique runtime names, asserting only on their own.
 * - groups-manager: admin of one group per mutating test ("Groups – Rename",
 *   "Groups – Active", "Groups – AutoAdd") plus two read-only groups
 *   ("Groups – Switch A" / "Groups – Switch B") for the switch, open and
 *   validate/cancel tests. Default group is Switch A.
 */

const SPEC = 'spec:e2e/groups/groups-admin.spec.ts' as const;
const PASSWORD = 'Seed-Pass-123!';

const empty: SeedUser = {
  key: 'groups-empty',
  uid: 'u-groups-empty',
  email: 'groups-empty@pipsplit.test',
  password: PASSWORD,
};

const creator: SeedUser = {
  key: 'groups-creator',
  uid: 'u-groups-creator',
  email: 'groups-creator@pipsplit.test',
  password: PASSWORD,
};

const manager: SeedUser = {
  key: 'groups-manager',
  uid: 'u-groups-manager',
  email: 'groups-manager@pipsplit.test',
  password: PASSWORD,
  profile: { defaultGroupKey: 'g-groups-switch-a' },
};

/** The manager's display name in every group they're in. */
const MANAGER_DISPLAY_NAME = 'Groups Manager';

function managerGroup(
  key: string,
  name: string,
  options: Pick<SeedGroup, 'active' | 'autoAddMembers'> = {}
): SeedGroup {
  return {
    key,
    owner: SPEC,
    name,
    ...options,
    members: [
      {
        key: 'groups-manager',
        displayName: MANAGER_DISPLAY_NAME,
        email: manager.email,
        userKey: manager.key,
        groupAdmin: true,
      },
    ],
    categories: [{ key: 'general', name: 'General' }],
  };
}

/** Renamed by "should edit group name". */
const rename = managerGroup('g-groups-rename', 'Groups – Rename');
/** Deactivated by "should toggle group active status". */
const active = managerGroup('g-groups-active', 'Groups – Active', {
  active: true,
});
/** Auto-add turned on by "should toggle auto-add members setting". */
const autoAdd = managerGroup('g-groups-autoadd', 'Groups – AutoAdd', {
  autoAddMembers: false,
});
/** Read-only. */
const switchA = managerGroup('g-groups-switch-a', 'Groups – Switch A');
/** Read-only. */
const switchB = managerGroup('g-groups-switch-b', 'Groups – Switch B');

export const GROUPS = {
  users: { empty, creator, manager },
  groups: { rename, active, autoAdd, switchA, switchB },
} as const;

export const GROUPS_DATASET: SeedDataset = {
  name: 'groups',
  users: Object.values(GROUPS.users),
  groups: Object.values(GROUPS.groups),
};
