import { MatDialogConfig, MatDialogRef } from '@angular/material/dialog';

/**
 * Config for dialogs a guided tour opens. The tour moves focus to its own
 * card, so the dialog mustn't grab focus (blurring an empty required field
 * would show its error) or hand focus back when it closes.
 */
export const GUIDED_TOUR_DIALOG_CONFIG: MatDialogConfig = {
  autoFocus: false,
  restoreFocus: false,
};

/**
 * Tracks the one dialog a page's guided tour has open, so steps can switch
 * between dialogs (or back to the page) in any order, including via Back.
 */
export class GuidedTourDialogs<K extends string> {
  #open: { kind: K; ref: MatDialogRef<unknown> } | null = null;

  /**
   * Opens `kind` (closing any other tour dialog) unless it's already open,
   * and resolves once its open animation finishes so its fields can be
   * measured.
   */
  async open(kind: K, openDialog: () => MatDialogRef<unknown>): Promise<void> {
    if (this.#open?.kind === kind) return;
    this.close();
    const ref = openDialog();
    this.#open = { kind, ref };
    await new Promise<void>((resolve) =>
      ref.afterOpened().subscribe(() => resolve())
    );
  }

  close(): void {
    this.#open?.ref.close();
    this.#open = null;
  }
}
