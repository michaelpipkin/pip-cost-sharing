import { TestBed } from '@angular/core/testing';
import { ResolveFn } from '@angular/router';

import { editMemorizedResolver } from './edit-memorized.resolver';

describe('editMemorizedResolver', () => {
  const executeResolver: ResolveFn<boolean> = (...resolverParameters) => 
      TestBed.runInInjectionContext(() => editMemorizedResolver(...resolverParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should be created', () => {
    expect(executeResolver).toBeTruthy();
  });
});
