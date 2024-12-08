import { TestBed } from '@angular/core/testing';
import { ResolveFn } from '@angular/router';

import { editExpenseResolver } from './edit-expense.resolver';

describe('editExpenseResolver', () => {
  const executeResolver: ResolveFn<boolean> = (...resolverParameters) => 
      TestBed.runInInjectionContext(() => editExpenseResolver(...resolverParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should be created', () => {
    expect(executeResolver).toBeTruthy();
  });
});
