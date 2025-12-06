import { DecimalPipe } from '@angular/common';
import { Component, inject, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { StringUtils } from '@utils/string-utils.service';

@Component({
  selector: 'app-calculator',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, DecimalPipe],
  templateUrl: './calculator.component.html',
  styleUrls: ['./calculator.component.scss'],
})
export class CalculatorComponent {
  private stringUtils = inject(StringUtils);

  resultSelected = output<number>();
  closed = output<void>();

  expression = signal<string>('');
  result = signal<number>(0);
  hasError = signal<boolean>(false);

  addNumber(num: string): void {
    const current = this.expression();
    this.expression.set(current + num);
    this.updateResult();
  }

  addOperation(op: string): void {
    const current = this.expression();

    // Replace display symbols with actual operators
    const actualOp = op === '×' ? '*' : op === '÷' ? '/' : op;

    this.expression.set(current + actualOp);
    this.updateResult();
  }

  clear(): void {
    this.expression.set('');
    this.result.set(0);
    this.hasError.set(false);
  }

  backspace(): void {
    const current = this.expression();
    this.expression.set(current.slice(0, -1));
    this.updateResult();
  }

  calculate(): void {
    this.updateResult();
  }

  useResult(): void {
    if (!this.hasError()) {
      this.resultSelected.emit(this.result());
      // Note: Don't emit closed here - the overlay service handles closing
      // when it receives resultSelected to avoid emitting on a destroyed component
    }
  }

  private updateResult(): void {
    const expr = this.expression();
    if (!expr) {
      this.result.set(0);
      this.hasError.set(false);
      return;
    }

    try {
      const calculated = this.stringUtils.toNumber(expr);
      this.result.set(calculated);
      this.hasError.set(false);
    } catch {
      this.hasError.set(true);
    }
  }
}
