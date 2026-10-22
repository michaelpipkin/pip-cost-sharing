import { OverlayContainer } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';

/**
 * Helpers for specs that open CDK overlays. Unit specs share one jsdom
 * document, so a pane left behind by one spec shows up in the next.
 */

/** Every overlay pane currently in the document. */
export function overlayPanes(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.cdk-overlay-pane'));
}

/**
 * Removes the overlay container (and with it every pane and backdrop) from the
 * document. Call in afterEach, after destroying fixtures and restoring spies;
 * assert `overlayPanes()` is empty afterwards.
 */
export function disposeOverlays(): void {
  TestBed.inject(OverlayContainer).ngOnDestroy();
}

/** A button inside the open overlay(s), found by its trimmed text. */
export function overlayButton(label: string): HTMLButtonElement {
  const button = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.cdk-overlay-container button')
  ).find((b) => b.textContent?.trim() === label);
  if (!button) {
    throw new Error(`No button "${label}" in the overlay`);
  }
  return button;
}

/** Clicks the overlay's backdrop (the outside-click that closes a panel). */
export function clickBackdrop(): void {
  const backdrop = document.querySelector<HTMLElement>(
    '.cdk-overlay-backdrop'
  );
  if (!backdrop) {
    throw new Error('No overlay backdrop in the document');
  }
  backdrop.click();
}
