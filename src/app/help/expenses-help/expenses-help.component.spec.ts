import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExpensesHelpComponent } from './expenses-help.component';

describe('ExpensesHelpComponent', () => {
  let component: ExpensesHelpComponent;
  let fixture: ComponentFixture<ExpensesHelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ExpensesHelpComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ExpensesHelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
