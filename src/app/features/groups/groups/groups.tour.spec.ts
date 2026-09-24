import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildGroupsTourSteps, GroupsTourHooks } from './groups.tour';

describe('buildGroupsTourSteps', () => {
  let hooks: { [K in keyof GroupsTourHooks]: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    hooks = {
      usingSample: vi.fn(() => false),
      canManage: vi.fn(() => true),
      openAddGroup: vi.fn(async () => {}),
      openManageGroups: vi.fn(async () => {}),
      closeDialogs: vi.fn(),
    };
  });

  const build = () => buildGroupsTourSteps(hooks as GroupsTourHooks);
  const step = (id: string) => build().find((s) => s.id === id)!;

  it('should walk the page, then New Group, then Manage Groups', () => {
    expect(build().map((s) => s.id)).toEqual([
      'intro',
      'group-select',
      'new-group',
      'add-group-names',
      'add-group-currency',
      'add-group-auto-add',
      'manage-groups',
      'manage-select',
      'manage-details',
      'manage-toggles',
      'manage-archive-delete',
      'manage-save',
    ]);
  });

  it.each(['intro', 'group-select', 'new-group', 'manage-groups'])(
    '%s should close any open dialog',
    async (id) => {
      await step(id).beforeShow!();
      expect(hooks.closeDialogs).toHaveBeenCalled();
    }
  );

  it.each(['add-group-names', 'add-group-currency', 'add-group-auto-add'])(
    '%s should be shown inside New Group',
    async (id) => {
      await step(id).beforeShow!();
      expect(hooks.openAddGroup).toHaveBeenCalled();
    }
  );

  it.each([
    'manage-select',
    'manage-details',
    'manage-toggles',
    'manage-archive-delete',
    'manage-save',
  ])('%s should be shown inside Manage Groups', async (id) => {
    await step(id).beforeShow!();
    expect(hooks.openManageGroups).toHaveBeenCalled();
  });

  it('should skip every Manage Groups step when there is nothing to manage', () => {
    hooks.canManage.mockReturnValue(false);
    const manageSteps = build().filter((s) => s.id.startsWith('manage'));
    expect(manageSteps).toHaveLength(6);
    expect(manageSteps.every((s) => s.when!() === false)).toBe(true);
  });

  it('should mention the samples only when showing them', () => {
    expect(step('intro').text).not.toContain('samples');
    hooks.usingSample.mockReturnValue(true);
    expect(step('intro').text).toContain('two samples');
  });
});
