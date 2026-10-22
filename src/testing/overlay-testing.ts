import { OverlayContainer } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { expect } from 'vitest';

/**
 * Helpers for specs that open CDK overlays. Unit specs share one jsdom
 * document, so a pane left behind by one spec shows up in the next.
 */

/** Every overlay pane currently in the document. */
export function overlayPanes(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.cdk-overlay-pane'));
}

/**
 * Leak check plus cleanup for the end of a spec that opens overlays. Call it
 * in afterEach, after destroying fixtures and restoring spies. It counts the
 * panes still in the document, THEN removes the overlay container (and with it
 * every pane and backdrop, so nothing reaches other specs in the shared jsdom
 * context), and fails if the count differs from `knownLeakedPanes` (default 0).
 * The count must come before the removal, or the check could never fail.
 */
export function disposeOverlays(options?: { knownLeakedPanes?: number }): void {
  const leaked = overlayPanes().length;
  try {
    TestBed.inject(OverlayContainer).ngOnDestroy();
  } finally {
    expect(leaked, 'overlay panes left open by the test').toBe(
      options?.knownLeakedPanes ?? 0
    );
  }
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
