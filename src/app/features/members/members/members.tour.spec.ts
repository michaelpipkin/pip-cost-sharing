import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMembersTourSteps, MembersTourHooks } from './members.tour';

describe('buildMembersTourSteps', () => {
  let hooks: { [K in keyof MembersTourHooks]: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    hooks = {
      usingSample: vi.fn(() => false),
      isAdmin: vi.fn(() => true),
      inviteColumnShown: vi.fn(() => true),
      showInactive: vi.fn(),
      openAddMember: vi.fn(async () => {}),
      openEditMember: vi.fn(async () => {}),
      closeDialogs: vi.fn(),
    };
  });

  const build = () => buildMembersTourSteps(hooks as MembersTourHooks);
  const step = (id: string) => build().find((s) => s.id === id)!;

  it('should walk the page, then Add Member, then Edit Member', () => {
    expect(build().map((s) => s.id)).toEqual([
      'intro',
      'filters',
      'table',
      'invite',
      'add-member',
      'add-member-fields',
      'edit-member',
      'edit-member-toggles',
      'edit-member-actions',
    ]);
  });

  it('should show inactive members on the filters step', async () => {
    await step('filters').beforeShow!();
    expect(hooks.showInactive).toHaveBeenCalled();
  });

  it('should open the right dialog for each dialog step', async () => {
    await step('add-member-fields').beforeShow!();
    expect(hooks.openAddMember).toHaveBeenCalled();
    for (const id of ['edit-member', 'edit-member-toggles', 'edit-member-actions']) {
      await step(id).beforeShow!();
    }
    expect(hooks.openEditMember).toHaveBeenCalledTimes(3);
  });

  it('should only show the invite step to admins when the column is shown', () => {
    expect(step('invite').when!()).toBe(true);
    hooks.inviteColumnShown.mockReturnValue(false);
    expect(step('invite').when!()).toBe(false);
    hooks.inviteColumnShown.mockReturnValue(true);
    hooks.isAdmin.mockReturnValue(false);
    expect(step('invite').when!()).toBe(false);
  });

  it('should tailor editing to non-admins (their own details, Leave Group)', () => {
    hooks.isAdmin.mockReturnValue(false);
    expect(step('edit-member').title).toBe('Edit your details');
    expect(step('edit-member').when).toBeUndefined();
    expect(step('edit-member-toggles').when!()).toBe(false);
    expect(step('edit-member-actions').title).toBe('Leave the group');
  });

  // B19: only the member changes a linked member's email, and a new address
  // takes effect once confirmed.
  it("should say who can change a member's email", () => {
    expect(step('edit-member').text).toBe(
      "Admins can change a member's name for this group, and their email until they register. After that, only the member can change it."
    );
    hooks.isAdmin.mockReturnValue(false);
    expect(step('edit-member').text).toBe(
      "Change the name and email address you use in this group. This email is just for the group; it doesn't change your login email. A new address takes effect once you confirm the link we send to it."
    );
  });

  it('should mention the samples only when showing them', () => {
    expect(step('intro').text).not.toContain('samples');
    hooks.usingSample.mockReturnValue(true);
    expect(step('intro').text).toContain('samples');
  });
});
