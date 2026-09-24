import { GuidedTourStep } from '@models/guided-tour';

/** What the Members tour needs from the page to demonstrate each step. */
export interface MembersTourHooks {
  /** True when the page is showing sample members (you're the only one). */
  usingSample(): boolean;
  /** Admins can add, invite, and edit anyone; others can edit themselves. */
  isAdmin(): boolean;
  /** True when the Invite to App column is showing. */
  inviteColumnShown(): boolean;
  /** Turns off "Active only" so inactive members show in the list. */
  showInactive(): void;
  openAddMember(): Promise<void>;
  /** Admins: opens Edit Member on another member. Others: on themselves. */
  openEditMember(): Promise<void>;
  closeDialogs(): void;
}

export function buildMembersTourSteps(
  hooks: MembersTourHooks
): GuidedTourStep[] {
  const onPage = () => hooks.closeDialogs();
  const isAdmin = () => hooks.isAdmin();
  const inEditMember = () => hooks.openEditMember();
  const admin = hooks.isAdmin();

  return [
    {
      id: 'intro',
      title: 'Members',
      text:
        'Members are the people in this group who share its expenses. Anyone who registers with the email address on their member record is linked to it automatically.' +
        (hooks.usingSample()
          ? " You're the only member so far, so the tour adds a few samples."
          : ''),
      beforeShow: onPage,
    },
    {
      id: 'filters',
      title: 'Find a member',
      text: 'Search by name or email, or turn off Active only to include inactive members in the list.',
      target: 'member-filters',
      beforeShow: () => {
        onPage();
        hooks.showInactive();
      },
    },
    {
      id: 'table',
      title: 'Your group',
      text:
        "Inactive members aren't offered when adding new expenses. Group admins manage members, categories, and expenses for everyone." +
        (admin
          ? ' Click a member to edit them.'
          : ' Click your own name to update your details.'),
      target: 'members-table',
      beforeShow: onPage,
    },
    {
      id: 'invite',
      title: 'Invite to the app',
      text: "The envelope sends an invitation email to an active member who hasn't registered yet. It's hidden for 24 hours after an invitation is sent, or until their email address changes.",
      target: 'invite-column',
      placement: 'left',
      when: () => isAdmin() && hooks.inviteColumnShown(),
      beforeShow: onPage,
    },
    {
      id: 'add-member',
      title: 'Add a member',
      text: 'Group admins add members here.',
      target: 'add-member',
      when: isAdmin,
      beforeShow: onPage,
    },
    {
      id: 'add-member-fields',
      title: 'Name and email',
      text: 'Enter their name and email address. When they register with that email, their account is linked to this member automatically.',
      target: 'add-member-fields',
      placement: 'right',
      when: isAdmin,
      beforeShow: () => hooks.openAddMember(),
    },
    {
      id: 'edit-member',
      title: admin ? 'Edit a member' : 'Edit your details',
      text: admin
        ? "Admins can change a member's name and email for this group."
        : 'Change the name and email address you use in this group. This email is just for the group; it doesn\'t change your login email.',
      target: 'edit-member-fields',
      placement: 'right',
      beforeShow: inEditMember,
    },
    {
      id: 'edit-member-toggles',
      title: 'Active and admin',
      text: "Turn off Active to stop offering a member for new expenses, or make them a group admin. You can't remove your own admin rights; another admin has to do that.",
      target: 'edit-member-toggles',
      placement: 'right',
      when: isAdmin,
      beforeShow: inEditMember,
    },
    {
      id: 'edit-member-actions',
      title: admin ? 'Remove a member' : 'Leave the group',
      text: admin
        ? "Remove works only for members with no expenses; otherwise, make them inactive instead. That's the tour!"
        : "Leave Group takes you out of the group; you can rejoin later from your account settings. That's the tour!",
      target: 'edit-member-actions',
      placement: 'right',
      beforeShow: inEditMember,
    },
  ];
}
