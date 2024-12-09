import { TestBed } from '@angular/core/testing';
import { CanActivateFn } from '@angular/router';
import { groupGuard } from './guards.guard';

describe('groupGuardGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => groupGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });
});
