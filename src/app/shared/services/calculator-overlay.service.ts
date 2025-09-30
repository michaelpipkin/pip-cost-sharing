import { Injectable, inject, ComponentRef, signal } from '@angular/core';
import { Overlay, OverlayRef, OverlayConfig } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { CalculatorComponent } from '../components/calculator/calculator.component';

@Injectable({
  providedIn: 'root'
})
export class CalculatorOverlayService {
  private readonly overlay = inject(Overlay);
  private overlayRef: OverlayRef | null = null;
  private calculatorRef: ComponentRef<CalculatorComponent> | null = null;
  private isOpen = signal(false);

  openCalculator(
    triggerElement: HTMLElement,
    onResult: (result: number) => void
  ): void {
    if (this.overlayRef) {
      this.closeCalculator();
    }

    const overlayConfig = this.getOverlayConfig(triggerElement);
    this.overlayRef = this.overlay.create(overlayConfig);

    const calculatorPortal = new ComponentPortal(CalculatorComponent);
    this.calculatorRef = this.overlayRef.attach(calculatorPortal);
    this.isOpen.set(true);

    // Handle calculator events using direct subscription
    const resultSub = this.calculatorRef.instance.resultSelected.subscribe((result: number) => {
      onResult(result);
      this.closeCalculator();
    });

    const closedSub = this.calculatorRef.instance.closed.subscribe(() => {
      this.closeCalculator();
    });

    // Close on backdrop click
    const backdropSub = this.overlayRef.backdropClick().subscribe(() => {
      this.closeCalculator();
    });

    // Handle keyboard input for calculator
    const keydownSub = this.overlayRef.keydownEvents().subscribe((event: KeyboardEvent) => {
      this.handleKeyboardInput(event);
    });

    // Store subscriptions for cleanup
    if (this.calculatorRef.instance) {
      (this.calculatorRef.instance as any)._subscriptions = [
        resultSub,
        closedSub,
        backdropSub,
        keydownSub
      ];
    }
  }

  closeCalculator(): void {
    if (this.overlayRef && this.calculatorRef) {
      // Clean up subscriptions
      const subs = (this.calculatorRef.instance as any)._subscriptions;
      if (subs) {
        subs.forEach((sub: any) => sub.unsubscribe());
      }

      this.overlayRef.dispose();
      this.overlayRef = null;
      this.calculatorRef = null;
      this.isOpen.set(false);
    }
  }

  private handleKeyboardInput(event: KeyboardEvent): void {
    if (!this.calculatorRef?.instance) return;

    // Prevent default to stop input from reaching underlying form fields
    event.preventDefault();
    event.stopPropagation();

    const calc = this.calculatorRef.instance;
    const key = event.key;

    // Handle numbers
    if (key >= '0' && key <= '9') {
      calc.addNumber(key);
      return;
    }

    // Handle decimal point
    if (key === '.' || key === ',') {
      calc.addNumber('.');
      return;
    }

    // Handle operations
    switch (key) {
      case '+':
        calc.addOperation('+');
        break;
      case '-':
        calc.addOperation('-');
        break;
      case '*':
      case 'x':
      case 'X':
        calc.addOperation('×');
        break;
      case '/':
        calc.addOperation('÷');
        break;
      case '(':
        calc.addNumber('(');
        break;
      case ')':
        calc.addNumber(')');
        break;
      case 'Enter':
      case '=':
        calc.useResult();
        break;
      case 'Escape':
        this.closeCalculator();
        break;
      case 'Backspace':
        calc.backspace();
        break;
      case 'Delete':
      case 'c':
      case 'C':
        calc.clear();
        break;
      default:
        // Ignore other keys
        break;
    }
  }

  private getOverlayConfig(triggerElement: HTMLElement): OverlayConfig {
    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(triggerElement)
      .withPositions([
        {
          originX: 'end',
          originY: 'bottom',
          overlayX: 'end',
          overlayY: 'top',
          offsetY: 8
        },
        {
          originX: 'end',
          originY: 'top',
          overlayX: 'end',
          overlayY: 'bottom',
          offsetY: -8
        },
        {
          originX: 'start',
          originY: 'bottom',
          overlayX: 'start',
          overlayY: 'top',
          offsetY: 8
        },
        {
          originX: 'center',
          originY: 'bottom',
          overlayX: 'center',
          overlayY: 'top',
          offsetY: 8
        }
      ])
      .withPush(true)
      .withViewportMargin(16);

    return new OverlayConfig({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'calculator-backdrop',
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      width: 'auto',
      height: 'auto'
    });
  }
}