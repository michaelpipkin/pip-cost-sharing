import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCategoriesTourSteps,
  CategoriesTourHooks,
} from './categories.tour';

describe('buildCategoriesTourSteps', () => {
  let hooks: { [K in keyof CategoriesTourHooks]: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    hooks = {
      usingSample: vi.fn(() => false),
      isAdmin: vi.fn(() => true),
      showInactive: vi.fn(),
      openAddCategory: vi.fn(async () => {}),
      openEditCategory: vi.fn(async () => {}),
      closeDialogs: vi.fn(),
    };
  });

  const build = () => buildCategoriesTourSteps(hooks as CategoriesTourHooks);
  const step = (id: string) => build().find((s) => s.id === id)!;

  it('should walk the page, then Add Category, then Edit Category', () => {
    expect(build().map((s) => s.id)).toEqual([
      'intro',
      'filters',
      'table',
      'add-category',
      'add-category-name',
      'edit-category',
      'delete-category',
    ]);
  });

  it('should show inactive categories on the filters step', async () => {
    await step('filters').beforeShow!();
    expect(hooks.showInactive).toHaveBeenCalled();
    expect(hooks.closeDialogs).toHaveBeenCalled();
  });

  it('should open the right dialog for each dialog step', async () => {
    await step('add-category-name').beforeShow!();
    expect(hooks.openAddCategory).toHaveBeenCalled();
    await step('edit-category').beforeShow!();
    await step('delete-category').beforeShow!();
    expect(hooks.openEditCategory).toHaveBeenCalledTimes(2);
  });

  it('should limit adding and editing to admins', () => {
    hooks.isAdmin.mockReturnValue(false);
    const adminSteps = build().filter((s) => s.when);
    expect(adminSteps.map((s) => s.id)).toEqual([
      'add-category',
      'add-category-name',
      'edit-category',
      'delete-category',
    ]);
    expect(adminSteps.every((s) => s.when!() === false)).toBe(true);
  });

  it('should mention the samples only when showing them', () => {
    expect(step('intro').text).not.toContain('samples');
    hooks.usingSample.mockReturnValue(true);
    expect(step('intro').text).toContain('samples');
  });
});
