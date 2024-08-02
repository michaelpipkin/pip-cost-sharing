import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MemorizedComponent } from './memorized.component';

describe('MemorizedComponent', () => {
  let component: MemorizedComponent;
  let fixture: ComponentFixture<MemorizedComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemorizedComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MemorizedComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
