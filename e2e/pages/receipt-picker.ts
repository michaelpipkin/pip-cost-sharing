import { expect, Locator, Page } from '@playwright/test';

/**
 * The dialogs that sit between "attach / select a receipt" and the file:
 * the one-time receipt retention policy (ReceiptDialog) and the source
 * picker (FileSelectionDialog), whose "Browse Files" button clicks the
 * page's own file input. Shared by Add Expense, Edit Expense and the receipt
 * scan page. Every locator is scoped to the open dialog, because
 * confirm-button and cancel-button also exist in other dialogs.
 */
export class ReceiptPicker {
  /** The receipt-policy dialog (a unique acknowledge checkbox marks it). */
  readonly policyDialog: Locator;
  readonly acknowledgeCheckbox: Locator;
  readonly acceptButton: Locator;
  /** The "Select Receipt" source picker. */
  readonly sourceDialog: Locator;
  readonly browseFilesButton: Locator;
  readonly cancelSourceButton: Locator;

  constructor(private readonly page: Page) {
    this.policyDialog = page
      .getByRole('dialog')
      .filter({ has: page.getByTestId('acknowledge-checkbox') });
    this.acknowledgeCheckbox = this.policyDialog
      .getByTestId('acknowledge-checkbox')
      .getByRole('checkbox');
    this.acceptButton = this.policyDialog.getByTestId('confirm-button');
    this.sourceDialog = page
      .getByRole('dialog')
      .filter({ has: page.getByTestId('file-button') });
    this.browseFilesButton = this.sourceDialog.getByTestId('file-button');
    this.cancelSourceButton = this.sourceDialog.getByTestId('cancel-button');
  }

  /** Ticks "I acknowledge" and accepts; the policy dialog then closes. */
  async acceptPolicy(): Promise<void> {
    await this.acknowledgeCheckbox.click();
    await expect(this.acknowledgeCheckbox).toBeChecked();
    await expect(this.acceptButton).toBeEnabled();
    await this.acceptButton.click();
    await expect(this.policyDialog).toBeHidden();
  }

  /**
   * In the source picker, "Browse Files": the app then clicks its hidden
   * file input, which Playwright surfaces as a file chooser. Sets `file` on
   * it and waits for the picker to close.
   */
  async browseFiles(file: string): Promise<void> {
    await expect(this.browseFilesButton).toBeVisible();
    const chooser = this.page.waitForEvent('filechooser');
    await this.browseFilesButton.click();
    await (await chooser).setFiles(file);
    await expect(this.sourceDialog).toBeHidden();
  }
}
