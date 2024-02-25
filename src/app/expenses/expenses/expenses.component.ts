import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { Expense } from '@models/expense';
import { ExpenseService } from '@services/expense.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-expenses',
  templateUrl: './expenses.component.html',
  styleUrl: './expenses.component.scss',
})
export class ExpensesComponent implements OnChanges {
  @Input() groupId: string = '';
  expenses$: Observable<Expense[]>;

  constructor(private expenseService: ExpenseService) {}

  ngOnChanges(changes: SimpleChanges): void {
    this.loadExpenses();
  }

  loadExpenses(): void {
    this.expenses$ = this.expenseService.getExpensesForGroup(this.groupId);
  }
}
