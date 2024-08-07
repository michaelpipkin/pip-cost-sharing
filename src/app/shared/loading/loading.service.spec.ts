import { TestBed } from '@angular/core/testing';
import { LoadingService } from './loading.service';

describe('LoadingService', () => {
  let service: LoadingService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LoadingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should turn loading signal on', () => {
    service.loadingOn();
    expect(service.loading()).toBeTrue();
  });

  it('should turn loading signal off', () => {
    service.loadingOff();
    expect(service.loading()).toBeFalse();
  });
});
