import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SummaryHelpComponent } from './summary-help.component';

describe('SummaryHelpComponent', () => {
  let component: SummaryHelpComponent;
  let fixture: ComponentFixture<SummaryHelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SummaryHelpComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SummaryHelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
