import { GuidedTourStep } from '@models/guided-tour';

/** What the Categories tour needs from the page to demonstrate each step. */
export interface CategoriesTourHooks {
  /** True when the page is showing sample categories (only Default exists). */
  usingSample(): boolean;
  /** Admins can add and edit categories; others only see the list. */
  isAdmin(): boolean;
  /** Turns off "Active only" so inactive categories show in the list. */
  showInactive(): void;
  openAddCategory(): Promise<void>;
  /** Opens Edit Category on the first category in the list. */
  openEditCategory(): Promise<void>;
  closeDialogs(): void;
}

export function buildCategoriesTourSteps(
  hooks: CategoriesTourHooks
): GuidedTourStep[] {
  const onPage = () => hooks.closeDialogs();
  const isAdmin = () => hooks.isAdmin();

  return [
    {
      id: 'intro',
      title: 'Categories',
      text:
        "Categories organize your group's expenses so you can filter and total them later. Every group starts with a Default category, and while a group has only one category, new expenses use it automatically." +
        (hooks.usingSample()
          ? ' Your group only has one category so far, so the tour adds a few samples.'
          : ''),
      beforeShow: onPage,
    },
    {
      id: 'filters',
      title: 'Find a category',
      text: 'Search by name, or turn off Active only to include inactive categories in the list.',
      target: 'category-filters',
      beforeShow: () => {
        onPage();
        hooks.showInactive();
      },
    },
    {
      id: 'table',
      title: 'Your categories',
      text: "Inactive categories aren't offered when adding new expenses, but expenses that already use them keep them.",
      target: 'categories-table',
      beforeShow: onPage,
    },
    {
      id: 'add-category',
      title: 'Add a category',
      text: 'Group admins can add as many categories as the group needs.',
      target: 'add-category',
      when: isAdmin,
      beforeShow: onPage,
    },
    {
      id: 'add-category-name',
      title: 'Name it',
      text: 'Just give the new category a name and save.',
      target: 'add-category-name',
      placement: 'right',
      when: isAdmin,
      beforeShow: () => hooks.openAddCategory(),
    },
    {
      id: 'edit-category',
      title: 'Edit a category',
      text: 'Click a category in the list to edit it. You can rename it, or turn off Active to stop it being offered for new expenses.',
      target: ['edit-category-name', 'edit-category-active'],
      placement: 'right',
      when: isAdmin,
      beforeShow: () => hooks.openEditCategory(),
    },
    {
      id: 'delete-category',
      title: 'Delete a category',
      text: "A category can only be deleted when no expenses use it; otherwise, make it inactive instead. That's the tour!",
      target: 'edit-category-actions',
      placement: 'right',
      when: isAdmin,
      beforeShow: () => hooks.openEditCategory(),
    },
  ];
}
