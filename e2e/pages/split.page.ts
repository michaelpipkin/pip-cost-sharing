import { expect, Locator, Page } from '@playwright/test';
import { formatMoney } from '../utils/format';
import { BasePage } from './base.page';
import type { SplitMethod } from './expenses.page';

/**
 * The public Split Expense calculator (/split): signed out, no Firestore.
 * Every amount, percentage and share input commits on blur, so the fill
 * helpers fill, blur and wait for the committed value.
 */
export class SplitPage extends BasePage {
  readonly totalAmountInput: Locator;
  readonly proportionalAmountInput: Locator;
  readonly sharedRemainder: Locator;
  readonly addSplitButton: Locator;
  readonly splitMethodToggles: Record<SplitMethod, Locator>;
  readonly vacationRentalButton: Locator;

  // One locator per split row field, in row order.
  readonly nameInputs: Locator;
  readonly memberAmountInputs: Locator;
  readonly percentageInputs: Locator;
  readonly sharesInputs: Locator;
  readonly allocatedAmounts: Locator;
  readonly removeButtons: Locator;

  readonly generateSummaryButton: Locator;
  readonly cancelButton: Locator;

  // Summary
  readonly summary: Locator;
  readonly summaryLines: Locator;
  readonly copySummaryButton: Locator;
  readonly editButton: Locator;
  readonly startOverButton: Locator;

  // Vacation rental mode
  readonly nightCountInput: Locator;
  readonly participantNameInput: Locator;
  readonly addParticipantButton: Locator;
  readonly participantRows: Locator;
  readonly nightRows: Locator;
  readonly participantShares: Locator;
  readonly participantAmounts: Locator;
  readonly applySharesButton: Locator;
  readonly cancelRentalButton: Locator;

  constructor(page: Page) {
    super(page);
    this.totalAmountInput = page.getByTestId('split-total-amount-input');
    this.proportionalAmountInput = page.getByTestId(
      'split-proportional-amount-input'
    );
    this.sharedRemainder = page.getByTestId('split-shared-remainder');
    this.addSplitButton = page.getByTestId('split-add-split-button');
    this.splitMethodToggles = {
      amount: page.getByTestId('split-by-amount-toggle'),
      percentage: page.getByTestId('split-by-percentage-toggle'),
      shares: page.getByTestId('split-by-shares-toggle'),
    };
    this.vacationRentalButton = page.getByTestId('vacation-rental-button');

    this.nameInputs = page.getByTestId('split-name-input');
    this.memberAmountInputs = page.getByTestId('split-member-amount-input');
    this.percentageInputs = page.getByTestId('split-percentage-input');
    this.sharesInputs = page.getByTestId('split-shares-input');
    this.allocatedAmounts = page.getByTestId('split-allocated-amount');
    this.removeButtons = page.getByTestId('split-remove-button');

    this.generateSummaryButton = page.getByTestId(
      'split-generate-summary-button'
    );
    this.cancelButton = page.getByTestId('split-cancel-button');

    this.summary = page.getByTestId('split-summary');
    this.summaryLines = page.getByTestId('split-summary-line');
    this.copySummaryButton = page.getByTestId('split-copy-summary-button');
    this.editButton = page.getByTestId('split-edit-button');
    this.startOverButton = page.getByTestId('split-start-over-button');

    this.nightCountInput = page.getByTestId('split-night-count-input');
    this.participantNameInput = page.getByTestId('add-participant-input');
    this.addParticipantButton = page.getByTestId('add-participant-button');
    this.participantRows = page.getByTestId('participant-row');
    this.nightRows = page.getByTestId('participant-nights-row');
    this.participantShares = page.getByTestId('participant-shares');
    this.participantAmounts = page.getByTestId('participant-amount');
    this.applySharesButton = page.getByTestId('apply-shares-button');
    this.cancelRentalButton = page.getByTestId('cancel-rental-button');
  }

  /** Opens /split signed out and waits until the form is interactive. */
  async gotoSplit(): Promise<void> {
    await this.goto('/split', { waitUntil: 'domcontentloaded' });
    await expect(this.addSplitButton).toBeEnabled();
    await expect(this.totalAmountInput).toBeEditable();
  }

  // ---- Form -----------------------------------------------------------------

  /** Types into an input and blurs it; the committed value is then shown. */
  private async fillAndCommit(
    input: Locator,
    typed: string,
    shown: string = typed
  ): Promise<void> {
    await input.fill(typed);
    await input.blur();
    await expect(input).toHaveValue(shown);
  }

  async setTotal(amount: number): Promise<void> {
    await this.fillAndCommit(
      this.totalAmountInput,
      amount.toString(),
      amount.toFixed(2)
    );
  }

  async setProportionalAmount(amount: number): Promise<void> {
    await this.fillAndCommit(
      this.proportionalAmountInput,
      amount.toString(),
      amount.toFixed(2)
    );
  }

  /**
   * Adds a split row named `name`. In amount mode `memberAmount` is the
   * person's fixed (personal) amount. Returns the new row's index.
   */
  async addPerson(name: string, memberAmount?: number): Promise<number> {
    const index = await this.nameInputs.count();
    await this.addSplitButton.click();
    await expect(this.nameInputs).toHaveCount(index + 1);
    await this.fillAndCommit(this.nameInputs.nth(index), name);
    if (memberAmount !== undefined) {
      await this.setMemberAmount(index, memberAmount);
    }
    return index;
  }

  async setMemberAmount(index: number, amount: number): Promise<void> {
    await this.fillAndCommit(
      this.memberAmountInputs.nth(index),
      amount.toString(),
      amount.toFixed(2)
    );
  }

  async setPercentage(index: number, percentage: number): Promise<void> {
    await this.fillAndCommit(
      this.percentageInputs.nth(index),
      percentage.toString()
    );
  }

  async setShares(index: number, shares: number): Promise<void> {
    await this.fillAndCommit(this.sharesInputs.nth(index), shares.toString());
  }

  async setMethod(method: SplitMethod): Promise<void> {
    // A single-select mat-button-toggle renders its button as role=radio.
    const radio = this.splitMethodToggles[method].getByRole('radio');
    await radio.click();
    await expect(radio).toBeChecked();
  }

  /** Asserts the value of every input in `inputs`, in row order. */
  async expectValues(inputs: Locator, values: string[]): Promise<void> {
    await expect(inputs).toHaveCount(values.length);
    for (const [i, value] of values.entries()) {
      await expect(inputs.nth(i)).toHaveValue(value);
    }
  }

  /** Asserts each split row's allocated amount, in row order. */
  async expectAllocatedAmounts(amounts: number[]): Promise<void> {
    await expect(this.allocatedAmounts).toHaveText(
      amounts.map((amount) => formatMoney(amount))
    );
  }

  // ---- Summary --------------------------------------------------------------

  async generateSummary(): Promise<void> {
    await this.generateSummaryButton.click();
    await expect(this.summary).toBeVisible();
  }

  /** Returns from the summary to the form with the values kept. */
  async editSplit(): Promise<void> {
    await this.editButton.click();
    await expect(this.summary).toBeHidden();
    await expect(this.addSplitButton).toBeVisible();
  }

  /** Clears the form and returns to it from the summary. */
  async startOver(): Promise<void> {
    await this.startOverButton.click();
    await expect(this.summary).toBeHidden();
    await expect(this.addSplitButton).toBeVisible();
  }

  // ---- Vacation rental ------------------------------------------------------

  async enterRentalMode(): Promise<void> {
    await this.vacationRentalButton.click();
    await expect(this.nightCountInput).toBeVisible();
  }

  async setNightCount(nights: number): Promise<void> {
    await this.fillAndCommit(this.nightCountInput, nights.toString());
    await expect(this.nightRows.first().getByTestId('night-checkbox')).toHaveCount(
      nights
    );
  }

  /** Adds a participant to the occupancy grid (present every night). */
  async addParticipant(name: string): Promise<void> {
    const count = await this.participantRows.count();
    await this.participantNameInput.fill(name);
    await this.addParticipantButton.click();
    await expect(this.participantRows).toHaveCount(count + 1);
    await expect(this.participantRows.nth(count)).toHaveText(name);
    await expect(this.participantNameInput).toHaveValue('');
  }

  /** The presence checkbox host for a participant row and night (0-based). */
  nightCheckbox(row: number, night: number): Locator {
    return this.nightRows.nth(row).getByTestId('night-checkbox').nth(night);
  }

  /** Sets a participant's presence on a night (0-based row and night). */
  async setPresent(
    row: number,
    night: number,
    present: boolean
  ): Promise<void> {
    const checkbox = this.nightCheckbox(row, night).getByRole('checkbox');
    if ((await checkbox.isChecked()) !== present) {
      await checkbox.click();
    }
    await expect(checkbox).toBeChecked({ checked: present });
  }

  /** Applies the grid's shares: back on the form, in shares mode. */
  async applyShares(): Promise<void> {
    await this.applySharesButton.click();
    await expect(this.applySharesButton).toBeHidden();
    await expect(this.addSplitButton).toBeVisible();
  }
}
