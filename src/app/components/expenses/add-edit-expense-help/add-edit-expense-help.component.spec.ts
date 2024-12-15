import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddEditExpenseHelpComponent } from './add-edit-expense-help.component';

describe('AddEditExpenseHelpComponent', () => {
  let component: AddEditExpenseHelpComponent;
  let fixture: ComponentFixture<AddEditExpenseHelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddEditExpenseHelpComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddEditExpenseHelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
