import { TestBed } from '@angular/core/testing';
import { CustomDateAdapter } from './custom-date-adapter.service';

describe('CustomDateAdapterService', () => {
  let service: CustomDateAdapter;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CustomDateAdapter);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
