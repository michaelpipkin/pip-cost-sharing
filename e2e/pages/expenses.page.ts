import { Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class ExpensesPage extends BasePage {
  // List page elements
  readonly addExpenseButton: Locator;
  readonly expensesTable: Locator;
  readonly filterInput: Locator;

  // Add Expense form elements
  readonly addExpenseContainer: Locator;
  readonly pageTitle: Locator;
  readonly helpButton: Locator;
  readonly tourButton: Locator;
  readonly addExpenseForm: Locator;
  readonly payerSelect: Locator;
  readonly dateInput: Locator;
  readonly datePickerToggle: Locator;
  readonly descriptionInput: Locator;
  readonly categorySelect: Locator;
  readonly totalAmountInput: Locator;
  readonly proportionalAmountInput: Locator;
  readonly calculatorButton: Locator;
  readonly percentageToggle: Locator;
  readonly addSplitButton: Locator;
  readonly addAllMembersButton: Locator;
  readonly saveButton: Locator;
  readonly saveAndAddAnotherButton: Locator;
  readonly cancelButton: Locator;
  readonly memorizeButton: Locator;
  readonly receiptInput: Locator;
  readonly receiptPreview: Locator;
  readonly removeReceiptButton: Locator;

  // Split elements (dynamic)
  readonly splitRows: Locator;
  readonly deleteSplitButtons: Locator;

  // Generic elements
  readonly formErrors: Locator;
  readonly snackbar: Locator;
  readonly deleteDialog: Locator;
  readonly confirmDeleteButton: Locator;

  constructor(page: Page) {
    super(page);

    // List page
    this.addExpenseButton = page.getByTestId('add-expense-button');
    this.expensesTable = page.getByTestId('expenses-table');
    this.filterInput = page.getByTestId('filter-input');

    // Add Expense form
    this.addExpenseContainer = page.getByTestId('add-expense-container');
    this.pageTitle = page.getByTestId('page-title');
    this.helpButton = page.getByTestId('help-button');
    this.tourButton = page.getByTestId('add-expense-tour-button');
    this.addExpenseForm = page.getByTestId('add-expense-form');
    this.payerSelect = page.getByTestId('payer-select');
    this.dateInput = page.getByTestId('date-input');
    this.datePickerToggle = page.getByTestId('date-picker-toggle');
    this.descriptionInput = page.getByTestId('description-input');
    this.categorySelect = page.locator('#category-select mat-select');
    this.totalAmountInput = page.locator('input[formControlName="amount"]');
    this.proportionalAmountInput = page.locator(
      'input[formControlName="allocatedAmount"]'
    );
    this.calculatorButton = page
      .locator('button[aria-label="Open calculator"]')
      .first();
    this.percentageToggle = page.getByTestId('split-by-percentage-button');
    this.addSplitButton = page.getByTestId('add-split-button');
    this.addAllMembersButton = page.getByTestId('add-all-members-button');
    this.saveButton = page
      .getByTestId('save-button')
      .filter({ hasText: 'Save' });
    this.saveAndAddAnotherButton = page.getByTestId(
      'save-and-add-another-button'
    );
    this.cancelButton = page.getByTestId('cancel-button');
    this.memorizeButton = page.getByTestId('memorize-button');
    this.receiptInput = page.locator('input[type="file"]');
    this.receiptPreview = page.getByTestId('receipt-preview');
    this.removeReceiptButton = page.getByTestId('remove-receipt-button');

    // Split elements - count mat-selects with formControlName="owedByMemberRef"
    // since there's exactly one per split
    this.splitRows = page.locator(
      'mat-select[formControlName="owedByMemberRef"]'
    );
    this.deleteSplitButtons = page.getByTestId('remove-split');

    // Generic
    this.formErrors = page.locator('mat-error');
    this.snackbar = page.locator('app-custom-snackbar');
    this.deleteDialog = page.locator('mat-dialog-container');
    this.confirmDeleteButton = page.getByTestId('confirm-delete');
  }

  async gotoList(): Promise<void> {
    await this.page.goto('/expenses');
    await this.waitForLoadingComplete();
  }

  async gotoAddExpense(): Promise<void> {
    await this.page.goto('/expenses/add');
    await this.waitForLoadingComplete();
  }

  async fillExpenseForm(data: {
    description: string;
    amount: number;
    proportionalAmount?: number;
  }): Promise<void> {
    // Fill description
    await this.descriptionInput.fill(data.description);
    await this.descriptionInput.blur();
    await this.page.waitForTimeout(300);

    // Fill total amount
    await this.totalAmountInput.fill(data.amount.toString());
    await this.totalAmountInput.blur();
    await this.page.waitForTimeout(500);

    // Handle proportional amount (only if explicitly provided by test)
    // Proportional amount should always be LESS than total amount
    const proportionalVisible = await this.proportionalAmountInput
      .isVisible()
      .catch(() => false);
    if (proportionalVisible && data.proportionalAmount !== undefined) {
      // Test explicitly set it - use that value
      await this.proportionalAmountInput.fill(
        data.proportionalAmount.toString()
      );
      await this.proportionalAmountInput.blur();
    }
    // Otherwise leave proportional amount at its default (usually 0)

    // Wait for form to update
    await this.page.waitForTimeout(500);
  }

  async addSplit(member: string, amount?: number): Promise<void> {
    // Wait for any loading spinners to disappear before clicking addSplit
    const loadingSpinner = this.page.locator(
      '[data-testid="loading-spinner-container"]'
    );
    const isSpinnerVisible = await loadingSpinner
      .isVisible()
      .catch(() => false);
    if (isSpinnerVisible) {
      await loadingSpinner.waitFor({ state: 'hidden', timeout: 10000 });
    }

    await this.addSplitButton.click();
    await this.page.waitForTimeout(300);

    // Get the last split row (this.splitRows are the mat-select elements themselves)
    const splitCount = await this.splitRows.count();
    const lastSplitSelect = this.splitRows.nth(splitCount - 1);

    // Wait for the mat-select to be ready for interaction
    await lastSplitSelect.waitFor({ state: 'visible', timeout: 5000 });
    await this.page.waitForTimeout(500);

    // Click the mat-select to open the dropdown
    await lastSplitSelect.click();

    // Wait for the Material overlay panel to appear
    await this.page
      .locator('.cdk-overlay-pane')
      .waitFor({ state: 'visible', timeout: 5000 });

    // Now find and click the option within the overlay
    const option = this.page
      .locator('.cdk-overlay-pane mat-option')
      .filter({ hasText: member });
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();

    // Wait for the dropdown to close
    await this.page
      .locator('.cdk-overlay-pane')
      .waitFor({ state: 'hidden', timeout: 5000 })
      .catch(() => {});

    // Fill amount if provided - need to find the amount input in the parent row
    if (amount !== undefined) {
      // Get the parent formGroup container and find the amount input within it
      const splitRow = this.page
        .locator('div[formArrayName="splits"] > div')
        .nth(splitCount - 1);
      const amountInput = splitRow.locator(
        'input[formControlName="assignedAmount"]'
      );
      await amountInput.fill(amount.toString());
      await amountInput.blur();
    }

    await this.page.waitForTimeout(300);
  }

  async addAllMembers(): Promise<void> {
    await this.addAllMembersButton.click();
    await this.page.waitForTimeout(500);
  }

  async removeSplit(index: number): Promise<void> {
    await this.deleteSplitButtons.nth(index).click();
    await this.page.waitForTimeout(300);
  }

  async updateSplitAmount(index: number, amount: number): Promise<void> {
    const splitRow = this.page
      .locator('div[formArrayName="splits"] > div')
      .nth(index);
    const amountInput = splitRow.locator(
      'input[formControlName="assignedAmount"]'
    );
    await amountInput.fill(amount.toString());
    await amountInput.blur();
    await this.page.waitForTimeout(500);
  }

  async uploadReceipt(filePath: string): Promise<void> {
    await this.receiptInput.setInputFiles(filePath);
    await this.page.waitForTimeout(500);
  }

  async removeReceipt(): Promise<void> {
    await this.removeReceiptButton.click();
  }

  async togglePercentageMode(): Promise<void> {
    await this.percentageToggle.click();
    await this.page.waitForTimeout(300);
  }

  async saveExpense(): Promise<void> {
    // Wait for the save button to be visible and enabled
    await this.saveButton.waitFor({ state: 'visible', timeout: 5000 });

    // Scroll button into view
    await this.saveButton.scrollIntoViewIfNeeded();

    // Wait for Angular to validate the allocation and enable the button
    await this.page.waitForTimeout(2000);

    // Check if button is enabled
    const isDisabled = await this.saveButton.isDisabled();
    if (isDisabled) {
      throw new Error(
        'Save button is disabled - form may be invalid or not fully allocated'
      );
    }

    // Click the save button
    await this.saveButton.click();

    // Wait for navigation or success message
    await this.waitForLoadingComplete();
  }

  async saveAndAddAnother(): Promise<void> {
    await this.saveAndAddAnotherButton.click();
    await this.waitForLoadingComplete();
    // Wait for form to reset
    await this.page.waitForTimeout(1000);
  }

  async memorizeExpense(): Promise<void> {
    await this.memorizeButton.click();
    await this.waitForLoadingComplete();
  }

  async cancelExpense(): Promise<void> {
    await this.cancelButton.click();
  }

  async verifySaveButtonDisabled(): Promise<boolean> {
    return await this.saveButton.isDisabled();
  }

  async verifySaveButtonEnabled(): Promise<boolean> {
    return await this.saveButton.isEnabled();
  }
}
