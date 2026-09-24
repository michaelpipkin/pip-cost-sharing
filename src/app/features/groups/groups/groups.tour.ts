import { GuidedTourStep } from '@models/guided-tour';

/** What the Groups tour needs from the page to demonstrate each step. */
export interface GroupsTourHooks {
  /** True when the page is showing sample groups (the user has none). */
  usingSample(): boolean;
  /** True when there's a group to show in Manage Groups (admin, or sample). */
  canManage(): boolean;
  /** Opens New Group (closing Manage Groups) unless it's already open. */
  openAddGroup(): Promise<void>;
  /** Opens Manage Groups (closing New Group) unless it's already open. */
  openManageGroups(): Promise<void>;
  closeDialogs(): void;
}

export function buildGroupsTourSteps(hooks: GroupsTourHooks): GuidedTourStep[] {
  const onPage = () => hooks.closeDialogs();
  const inAddGroup = () => hooks.openAddGroup();
  const inManageGroups = () => hooks.openManageGroups();
  const canManage = () => hooks.canManage();

  return [
    {
      id: 'intro',
      title: 'Groups',
      text:
        'A group is the set of people you share expenses with: roommates, a trip, a household. Group admins add members by email, and your account is linked automatically when you register with that email.' +
        (hooks.usingSample()
          ? " You don't have any groups yet, so the tour shows two samples."
          : ''),
      beforeShow: onPage,
    },
    {
      id: 'group-select',
      title: 'Choose your group',
      text: "Pick the group you're working with. Members, Expenses, Summary, and the other pages all show the selected group. Inactive and archived groups aren't listed.",
      target: 'group-select',
      beforeShow: onPage,
    },
    {
      id: 'new-group',
      title: 'Create a group',
      text: "New Group starts a new group, and you're automatically its admin. Here's what the form asks for.",
      target: 'new-group',
      beforeShow: onPage,
    },
    {
      id: 'add-group-names',
      title: 'Name the group',
      text: 'Give the group a name, and enter your name as the other members will see it.',
      target: ['add-group-name', 'add-group-display-name'],
      placement: 'right',
      beforeShow: inAddGroup,
    },
    {
      id: 'add-group-currency',
      title: 'Currency',
      text: "Choose the group's currency. It can't be changed once the group has expenses, so pick carefully.",
      target: 'add-group-currency',
      placement: 'right',
      beforeShow: inAddGroup,
    },
    {
      id: 'add-group-auto-add',
      title: 'Add everyone automatically',
      text: 'When this is on, every new expense starts with a split line for each group member, which is handy when everyone usually shares.',
      target: 'add-group-auto-add',
      placement: 'right',
      beforeShow: inAddGroup,
    },
    {
      id: 'manage-groups',
      title: 'Manage your groups',
      text: "Manage Groups lets you change the groups you're an admin of.",
      target: 'manage-groups',
      when: canManage,
      beforeShow: onPage,
    },
    {
      id: 'manage-select',
      title: 'Pick a group to change',
      text: 'Choose which of your groups to edit. Archived groups are listed here too, marked (Archived).',
      target: 'manage-select',
      placement: 'right',
      when: canManage,
      beforeShow: inManageGroups,
    },
    {
      id: 'manage-details',
      title: 'Name and currency',
      text: "Rename the group, or change its currency while it doesn't have any expenses yet.",
      target: ['manage-name', 'manage-currency'],
      placement: 'right',
      when: canManage,
      beforeShow: inManageGroups,
    },
    {
      id: 'manage-toggles',
      title: 'Active and auto-add',
      text: 'Turn off Active to hide a group from the group selector. The auto-add setting works the same as when creating a group.',
      target: ['manage-active', 'manage-auto-add'],
      placement: 'right',
      when: canManage,
      beforeShow: inManageGroups,
    },
    {
      id: 'manage-archive-delete',
      title: 'Archive or delete',
      text: 'Archive a group you no longer use but want to keep for its history; it stays here, and Unarchive Group brings it back. Delete Group permanently removes the group and all its expenses, members, and categories.',
      target: ['manage-archive', 'manage-delete'],
      placement: 'right',
      when: canManage,
      beforeShow: inManageGroups,
    },
    {
      id: 'manage-save',
      title: 'Save your changes',
      text: "Save applies your changes to the group. That's the tour!",
      target: 'manage-actions',
      placement: 'right',
      when: canManage,
      beforeShow: inManageGroups,
    },
  ];
}
