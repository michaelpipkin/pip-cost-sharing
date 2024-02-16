import { TestBed } from '@angular/core/testing';

import { SplitsService } from './splits.service';

describe('SplitsService', () => {
  let service: SplitsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SplitsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
