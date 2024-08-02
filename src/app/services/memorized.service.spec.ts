import { TestBed } from '@angular/core/testing';

import { MemorizedService } from './memorized.service';

describe('MemorizedService', () => {
  let service: MemorizedService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MemorizedService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
