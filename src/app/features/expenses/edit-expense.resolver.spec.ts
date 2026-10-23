import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  convertToParamMap,
  provideRouter,
  RedirectCommand,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { ExpenseService } from '@services/expense.service';
import { GroupStore } from '@store/group.store';
import {
  createMockExpenseService,
  createMockGroupStore,
  mockGroup,
} from '@testing/test-helpers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { editExpenseResolver } from './edit-expense.resolver';

describe('editExpenseResolver', () => {
  let mockExpenseService: ReturnType<typeof createMockExpenseService>;
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;

  const route = {
    paramMap: convertToParamMap({ id: 'expense-7' }),
  } as unknown as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;

  function resolve() {
    return TestBed.runInInjectionContext(() =>
      editExpenseResolver(route, state)
    );
  }

  beforeEach(() => {
    mockExpenseService = createMockExpenseService();
    mockGroupStore = createMockGroupStore();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ExpenseService, useValue: mockExpenseService },
        { provide: GroupStore, useValue: mockGroupStore },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should fetch the expense with the current group id and the route id', async () => {
    mockGroupStore.currentGroup.set(mockGroup({ id: 'group-9' }));
    const expense = { id: 'expense-7', description: 'Dinner' };
    mockExpenseService.getExpense.mockResolvedValue(expense);

    const result = await resolve();

    expect(mockExpenseService.getExpense).toHaveBeenCalledTimes(1);
    expect(mockExpenseService.getExpense).toHaveBeenCalledWith(
      'group-9',
      'expense-7'
    );
    expect(result).toBe(expense);
  });

  it('should propagate a rejection from getExpense', async () => {
    mockGroupStore.currentGroup.set(mockGroup({ id: 'group-9' }));
    mockExpenseService.getExpense.mockRejectedValue(new Error('not found'));

    await expect(resolve()).rejects.toThrow('not found');
  });

  // BUG (B9): src/app/features/expenses/edit-expense.resolver.ts:10
  // currentGroup()!.id throws a TypeError when there is no current group instead of
  // redirecting to Expenses. Deferred by owner 2026-10-21; remove it.fails when fixed.
  it.fails('should redirect to Expenses instead of throwing when there is no current group', async () => {
    mockGroupStore.currentGroup.set(null);

    const result = await resolve();

    const target =
      result instanceof RedirectCommand
        ? (result.redirectTo as UrlTree)
        : (result as unknown as UrlTree);
    expect(TestBed.inject(Router).serializeUrl(target)).toBe('/expenses');
    expect(mockExpenseService.getExpense).not.toHaveBeenCalled();
  });
});
