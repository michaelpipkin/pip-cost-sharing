import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HistoryHelpComponent } from './history-help.component';

describe('HistoryHelpComponent', () => {
  let component: HistoryHelpComponent;
  let fixture: ComponentFixture<HistoryHelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HistoryHelpComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HistoryHelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
