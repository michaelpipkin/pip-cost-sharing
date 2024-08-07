import { TestBed } from '@angular/core/testing';
import { StringUtils } from './string-utils.service';


describe('StringUtilsService', () => {
  let service: StringUtils;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StringUtils);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
