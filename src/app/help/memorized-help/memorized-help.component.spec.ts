import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MemorizedHelpComponent } from './memorized-help.component';

describe('MemorizedHelpComponent', () => {
  let component: MemorizedHelpComponent;
  let fixture: ComponentFixture<MemorizedHelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MemorizedHelpComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(MemorizedHelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
