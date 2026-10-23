import { Overlay, OverlayConfig, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { ComponentRef, inject, Injectable, signal } from '@angular/core';
import { CalculatorComponent } from '@components/calculator/calculator.component';

@Injectable({
  providedIn: 'root',
})
export class CalculatorOverlayService {
  protected readonly overlay = inject(Overlay);
  private overlayRef: OverlayRef | null = null;
  private calculatorRef: ComponentRef<CalculatorComponent> | null = null;
  private readonly isOpen = signal(false);
  private associatedInputElement: HTMLInputElement | null = null;

  openCalculator(
    triggerElement: HTMLElement,
    onResult: (result: number) => void
  ): void {
    if (this.overlayRef) {
      this.closeCalculator();
    }

    // Dismiss virtual keyboard on mobile by blurring associated input field
    this.dismissVirtualKeyboard(triggerElement);

    // Store the associated input element for refocusing after calculator closes
    this.associatedInputElement = this.findAssociatedInput(triggerElement);

    const overlayConfig = this.getOverlayConfig(triggerElement);
    this.overlayRef = this.overlay.create(overlayConfig);

    const calculatorPortal = new ComponentPortal(CalculatorComponent);
    this.calculatorRef = this.overlayRef.attach(calculatorPortal);
    this.isOpen.set(true);

    // Handle calculator events using direct subscription
    const resultSub = this.calculatorRef.instance.resultSelected.subscribe(
      (result: number) => {
        onResult(result);
        this.closeCalculator(true); // Trigger blur to format the input
      }
    );

    const closedSub = this.calculatorRef.instance.closed.subscribe(() => {
      this.closeCalculator();
    });

    // Close on backdrop click
    const backdropSub = this.overlayRef.backdropClick().subscribe(() => {
      this.closeCalculator();
    });

    // Handle keyboard input for calculator
    const keydownSub = this.overlayRef
      .keydownEvents()
      .subscribe((event: KeyboardEvent) => {
        this.handleKeyboardInput(event);
      });

    // Store subscriptions for cleanup
    if (this.calculatorRef.instance) {
      (this.calculatorRef.instance as any)._subscriptions = [
        resultSub,
        closedSub,
        backdropSub,
        keydownSub,
      ];
    }
  }

  closeCalculator(triggerBlur: boolean = false): void {
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

      // Trigger blur on the associated input to run formatting directives
      if (triggerBlur && this.associatedInputElement) {
        // Use setTimeout to ensure the overlay is fully disposed before triggering blur
        const inputElement = this.associatedInputElement;
        setTimeout(() => {
          inputElement.focus();
          inputElement.blur();
        }, 0);
      }
      this.associatedInputElement = null;
    }
  }

  private findAssociatedInput(
    triggerElement: HTMLElement
  ): HTMLInputElement | null {
    const matFormField = triggerElement.closest('mat-form-field');
    if (matFormField) {
      return matFormField.querySelector('input') as HTMLInputElement;
    }
    return null;
  }

  private dismissVirtualKeyboard(triggerElement: HTMLElement): void {
    // Find the input field associated with this calculator button
    const matFormField = triggerElement.closest('mat-form-field');
    if (matFormField) {
      const inputElement = matFormField.querySelector(
        'input'
      ) as HTMLInputElement;
      if (inputElement) {
        // Multiple aggressive approaches to dismiss virtual keyboard
        inputElement.blur();
        inputElement.readOnly = true;

        // Force viewport reset to dismiss keyboard on iOS
        if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
          globalThis.scrollTo(0, 0);
        }

        // Create a temporary hidden input to steal focus
        const hiddenInput = document.createElement('input');
        hiddenInput.style.position = 'absolute';
        hiddenInput.style.top = '-9999px';
        hiddenInput.style.left = '-9999px';
        hiddenInput.style.opacity = '0';
        hiddenInput.style.pointerEvents = 'none';
        hiddenInput.setAttribute('readonly', 'true');

        document.body.appendChild(hiddenInput);
        hiddenInput.focus();
        hiddenInput.blur();

        setTimeout(() => {
          hiddenInput.remove();
          inputElement.readOnly = false;
        }, 300);
      }
    }

    // Also blur any currently active element as fallback
    if (
      document.activeElement &&
      document.activeElement instanceof HTMLElement
    ) {
      document.activeElement.blur();
    }
  }

  private handleKeyboardInput(event: KeyboardEvent): void {
    if (!this.calculatorRef?.instance) return;

    // Browser and OS shortcuts (Ctrl/Cmd/Alt combinations) are not calculator
    // input; Tab and any other non-calculator key also pass through untouched.
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (!this.applyKey(event.key)) return;

    // Only a key the calculator used is kept from the underlying form fields
    event.preventDefault();
    event.stopPropagation();
  }

  /** Applies a calculator key; returns false when the key is not one. */
  private applyKey(key: string): boolean {
    const calc = this.calculatorRef!.instance;

    // Handle numbers
    if (key.length === 1 && key >= '0' && key <= '9') {
      calc.addNumber(key);
      return true;
    }

    switch (key) {
      case '.':
      case ',':
        calc.addNumber('.');
        break;
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
        return false;
    }
    return true;
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
          offsetY: 8,
        },
        {
          originX: 'end',
          originY: 'top',
          overlayX: 'end',
          overlayY: 'bottom',
          offsetY: -8,
        },
        {
          originX: 'start',
          originY: 'bottom',
          overlayX: 'start',
          overlayY: 'top',
          offsetY: 8,
        },
        {
          originX: 'center',
          originY: 'bottom',
          overlayX: 'center',
          overlayY: 'top',
          offsetY: 8,
        },
      ])
      .withPush(true)
      .withViewportMargin(16);

    return new OverlayConfig({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'calculator-backdrop',
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      width: 'auto',
      height: 'auto',
    });
  }
}
