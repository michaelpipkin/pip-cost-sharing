import { expect, Locator, Page } from '@playwright/test';
import { formatMoney } from '../utils/format';
import { BasePage } from './base.page';

export type SplitMethod = 'amount' | 'percentage' | 'shares';

/**
 * The split-method toggle (`app-split-method-toggle`), shared by Add
 * Expense, the memorized forms and the public Split page. Scope it to the
 * form that hosts it, or to the page when only one toggle exists.
 */
export class SplitMethodToggle {
  readonly toggles: Record<SplitMethod, Locator>;

  constructor(scope: Page | Locator) {
    this.toggles = {
      amount: scope.getByTestId('split-by-amount-toggle'),
      percentage: scope.getByTestId('split-by-percentage-toggle'),
      shares: scope.getByTestId('split-by-shares-toggle'),
    };
  }

  /** A single-select mat-button-toggle renders its button as role=radio. */
  radio(method: SplitMethod): Locator {
    return this.toggles[method].getByRole('radio');
  }

  /** Switches the method and waits for the radio to show it checked. */
  async select(method: SplitMethod): Promise<void> {
    const radio = this.radio(method);
    await radio.click();
    await expect(radio).toBeChecked();
  }
}

/**
 * The expense form shared by Add Expense and the Memorize / Edit Memorized
 * forms: payer, description, category, amounts, split rows and Save /
 * Cancel. Every locator is scoped to `container`, because the same test ids
 * also sit in dialogs (cancel-button) and on other pages (description-input
 * on the rental wizard and the receipt scan).
 *
 * Amount inputs commit on blur (the form re-allocates then), so the fill
 * helpers fill, blur and assert the formatted value. Extends BasePage for
 * the mat-select helper.
 */
export class ExpenseForm extends BasePage {
  readonly payerSelect: Locator;
  readonly descriptionInput: Locator;
  readonly categorySelect: Locator;
  readonly totalAmountInput: Locator;
  readonly proportionalAmountInput: Locator;
  readonly sharedRemainderAmount: Locator;
  readonly split: SplitMethodToggle;
  readonly splitMethodToggles: Record<SplitMethod, Locator>;
  readonly addSplitButton: Locator;
  readonly addAllMembersButton: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  // Split rows: each locator has one match per split, in row order (.nth(i)).
  /** The per-split member selects - one per split, so also the split count. */
  readonly splitRows: Locator;
  readonly assignedAmountInputs: Locator;
  readonly percentageInputs: Locator;
  readonly sharesInputs: Locator;
  readonly allocatedAmounts: Locator;
  readonly deleteSplitButtons: Locator;

  constructor(
    page: Page,
    readonly container: Locator
  ) {
    super(page);
    this.payerSelect = container.getByTestId('payer-select');
    this.descriptionInput = container.getByTestId('description-input');
    this.categorySelect = container.getByTestId('category-select');
    this.totalAmountInput = container.getByTestId('total-amount-input');
    this.proportionalAmountInput = container.getByTestId(
      'proportional-amount-input'
    );
    this.sharedRemainderAmount = container.getByTestId(
      'shared-remainder-amount'
    );
    this.split = new SplitMethodToggle(container);
    this.splitMethodToggles = this.split.toggles;
    this.addSplitButton = container.getByTestId('add-split-button');
    this.addAllMembersButton = container.getByTestId('add-all-members-button');
    this.saveButton = container.getByTestId('save-button');
    this.cancelButton = container.getByTestId('cancel-button');

    this.splitRows = container.getByTestId('split-member-select');
    this.assignedAmountInputs = container.getByTestId(
      'split-assigned-amount-input'
    );
    this.percentageInputs = container.getByTestId('split-percentage-input');
    this.sharesInputs = container.getByTestId('split-shares-input');
    this.allocatedAmounts = container.getByTestId('allocated-amount');
    this.deleteSplitButtons = container.getByTestId('remove-split');
  }

  // ---- Fields -------------------------------------------------------------

  async selectPayer(memberName: string): Promise<void> {
    await this.chooseOption(this.payerSelect, memberName);
  }

  async selectCategory(categoryName: string): Promise<void> {
    await this.chooseOption(this.categorySelect, categoryName);
  }

  /** Changes split row `index`'s member. */
  async selectSplitMember(index: number, memberName: string): Promise<void> {
    await this.chooseOption(this.splitRows.nth(index), memberName);
  }

  /**
   * Types an amount into a currency input and blurs it (which runs the
   * form's re-allocation); the input then shows it formatted to cents.
   */
  private async fillCurrency(input: Locator, amount: number): Promise<void> {
    await input.fill(amount.toString());
    await input.blur();
    await expect(input).toHaveValue(amount.toFixed(2));
  }

  async setDescription(description: string): Promise<void> {
    await this.descriptionInput.fill(description);
    await this.descriptionInput.blur();
    await expect(this.descriptionInput).toHaveValue(description);
  }

  async setTotalAmount(amount: number): Promise<void> {
    await this.fillCurrency(this.totalAmountInput, amount);
  }

  async setProportionalAmount(amount: number): Promise<void> {
    await this.fillCurrency(this.proportionalAmountInput, amount);
  }

  /**
   * Fills description, category (when given; a one-category group selects
   * its category itself), total and, when given, the proportional amount.
   */
  async fillExpenseForm(data: {
    description: string;
    amount: number;
    category?: string;
    proportionalAmount?: number;
  }): Promise<void> {
    await this.setDescription(data.description);
    if (data.category !== undefined) {
      await this.selectCategory(data.category);
    }
    await this.setTotalAmount(data.amount);
    if (data.proportionalAmount !== undefined) {
      await this.setProportionalAmount(data.proportionalAmount);
    }
  }

  // ---- Splits -------------------------------------------------------------

  /**
   * Adds one split row. The form fills it with the first member not yet in a
   * split; pass `member` to change that, and `amount` to set its member
   * amount (amount split method).
   */
  async addSplit(member?: string, amount?: number): Promise<void> {
    const count = await this.splitRows.count();
    await this.addSplitButton.click();
    await expect(this.splitRows).toHaveCount(count + 1);
    if (member !== undefined) {
      await this.selectSplitMember(count, member);
    }
    if (amount !== undefined) {
      await this.updateSplitAmount(count, amount);
    }
  }

  /**
   * Adds a split for every active member not already in one. Waits until it
   * has: both add buttons disable once every member has a split.
   */
  async addAllMembers(): Promise<void> {
    await this.addAllMembersButton.click();
    await expect(this.addAllMembersButton).toBeDisabled();
  }

  async removeSplit(index: number): Promise<void> {
    const count = await this.splitRows.count();
    await this.deleteSplitButtons.nth(index).click();
    await expect(this.splitRows).toHaveCount(count - 1);
  }

  /** Sets split row `index`'s member amount (amount split method). */
  async updateSplitAmount(index: number, amount: number): Promise<void> {
    const input = this.assignedAmountInputs.nth(index);
    await input.fill(amount.toString());
    await input.blur();
  }

  /** Sets split row `index`'s percentage (not the last row: it's computed). */
  async setSplitPercentage(index: number, percentage: number): Promise<void> {
    const input = this.percentageInputs.nth(index);
    await input.fill(percentage.toString());
    await input.blur();
  }

  async setSplitShares(index: number, shares: number): Promise<void> {
    const input = this.sharesInputs.nth(index);
    await input.fill(shares.toString());
    await input.blur();
  }

  /** Switches the split method and waits for its toggle to show it. */
  async setSplitMethod(method: SplitMethod): Promise<void> {
    await this.split.select(method);
  }

  /** Asserts each split row's allocated amount, in row order. */
  async expectAllocatedAmounts(amounts: number[]): Promise<void> {
    await expect(this.allocatedAmounts).toHaveText(
      amounts.map((amount) => formatMoney(amount))
    );
  }
}
