import type { SeedDataset, SeedGroup, SeedUser } from '../types';

/**
 * Owned by e2e/groups/groups-admin.spec.ts.
 *
 * One user per test that mutates data or selects/switches groups, so no two
 * tests that can run in parallel sign in as the same user. Selecting a group
 * saves it as the user's default (users/{uid}.defaultGroupRef), which every
 * other tab signed in as that user picks up on its next load. (Before the
 * 2026-10-20 group-loading fixes, every page load also rewrote it, so a
 * second tab could undo the first tab's selection mid-test.) Read-only tests
 * that never select a group share a user.
 *
 * - groups-empty: no groups; shared by the read-only empty-state, validation,
 *   cancel and tour tests. No test may create a group as this user.
 * - groups-first-creator: no groups; "should create a group and make it
 *   selectable" creates their first group.
 * - groups-enter-creator: no groups; "should create a group by pressing
 *   Enter through to Save" creates their first group.
 * - groups-autoadd-creator / groups-multi-creator / groups-workflow-creator:
 *   one creation test each, with a seeded default "home" group. Created
 *   groups get unique runtime names.
 * - groups-viewer: admin of "Groups – View A" (default) and "Groups – View B";
 *   shared by the read-only manage tests (none of them saves or changes the
 *   page's selected group).
 * - groups-switcher: "Groups – Switch A" (default) / "Groups – Switch B".
 * - groups-renamer: "Groups – Rename" (default), renamed by its test.
 * - groups-activator: "Groups – Active Home" (default) plus "Groups – Active",
 *   which its test deactivates (the home group keeps the select on screen).
 * - groups-active-bystander: a plain member of "Groups – Active" whose
 *   default it is. Never signs in; the deactivate test checks that the
 *   app's batch cleared their default (a cross-user write the users rule
 *   allows only to the group's admins). One-shot per seeding.
 * - groups-autoadder: "Groups – AutoAdd" (default), auto-add turned on.
 */

const SPEC = 'spec:e2e/groups/groups-admin.spec.ts' as const;
const PASSWORD = 'Seed-Pass-123!';

function seedUser(key: string, defaultGroupKey?: string): SeedUser {
  return {
    key,
    uid: `u-${key}`,
    email: `${key}@pipsplit.test`,
    password: PASSWORD,
    ...(defaultGroupKey ? { profile: { defaultGroupKey } } : {}),
  };
}

/** A group whose only member is `user`, as its admin. */
function soloGroup(
  key: string,
  name: string,
  user: SeedUser,
  options: Pick<SeedGroup, 'active' | 'autoAddMembers'> = {}
): SeedGroup {
  return {
    key,
    owner: SPEC,
    name,
    ...options,
    members: [
      {
        key: user.key,
        displayName: `Member ${user.key}`,
        email: user.email,
        userKey: user.key,
        groupAdmin: true,
      },
    ],
    categories: [{ key: 'general', name: 'General' }],
  };
}

const empty = seedUser('groups-empty');
const firstCreator = seedUser('groups-first-creator');
const enterCreator = seedUser('groups-enter-creator');
const autoAddCreator = seedUser(
  'groups-autoadd-creator',
  'g-groups-autoadd-creator-home'
);
const multiCreator = seedUser(
  'groups-multi-creator',
  'g-groups-multi-creator-home'
);
const workflowCreator = seedUser(
  'groups-workflow-creator',
  'g-groups-workflow-creator-home'
);
const viewer = seedUser('groups-viewer', 'g-groups-view-a');
const switcher = seedUser('groups-switcher', 'g-groups-switch-a');
const renamer = seedUser('groups-renamer', 'g-groups-rename');
const activator = seedUser('groups-activator', 'g-groups-active-home');
const activeBystander = seedUser('groups-active-bystander', 'g-groups-active');
const autoAdder = seedUser('groups-autoadder', 'g-groups-autoadd');

const autoAddCreatorHome = soloGroup(
  'g-groups-autoadd-creator-home',
  'Groups – AutoAdd Creator Home',
  autoAddCreator
);
const multiCreatorHome = soloGroup(
  'g-groups-multi-creator-home',
  'Groups – Multi Creator Home',
  multiCreator
);
const workflowCreatorHome = soloGroup(
  'g-groups-workflow-creator-home',
  'Groups – Workflow Creator Home',
  workflowCreator
);
/** Read-only. */
const viewA = soloGroup('g-groups-view-a', 'Groups – View A', viewer);
/** Read-only. */
const viewB = soloGroup('g-groups-view-b', 'Groups – View B', viewer);
/** Selected back and forth; never edited. */
const switchA = soloGroup('g-groups-switch-a', 'Groups – Switch A', switcher);
const switchB = soloGroup('g-groups-switch-b', 'Groups – Switch B', switcher);
/** Renamed by "should edit group name". */
const rename = soloGroup('g-groups-rename', 'Groups – Rename', renamer);
const activeHome = soloGroup(
  'g-groups-active-home',
  'Groups – Active Home',
  activator
);
/** Deactivated by "should toggle group active status". */
const activeSolo = soloGroup('g-groups-active', 'Groups – Active', activator, {
  active: true,
});
const active: SeedGroup = {
  ...activeSolo,
  members: [
    ...activeSolo.members,
    {
      key: activeBystander.key,
      displayName: `Member ${activeBystander.key}`,
      email: activeBystander.email,
      userKey: activeBystander.key,
    },
  ],
};
/** Auto-add turned on by "should toggle auto-add members setting". */
const autoAdd = soloGroup('g-groups-autoadd', 'Groups – AutoAdd', autoAdder, {
  autoAddMembers: false,
});

export const GROUPS = {
  users: {
    empty,
    firstCreator,
    enterCreator,
    autoAddCreator,
    multiCreator,
    workflowCreator,
    viewer,
    switcher,
    renamer,
    activator,
    activeBystander,
    autoAdder,
  },
  groups: {
    autoAddCreatorHome,
    multiCreatorHome,
    workflowCreatorHome,
    viewA,
    viewB,
    switchA,
    switchB,
    rename,
    activeHome,
    active,
    autoAdd,
  },
} as const;

export const GROUPS_DATASET: SeedDataset = {
  name: 'groups',
  users: Object.values(GROUPS.users),
  groups: Object.values(GROUPS.groups),
};
