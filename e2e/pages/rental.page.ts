import { expect, Locator, Page } from '@playwright/test';
import { formatMoney } from '../utils/format';
import { BasePage } from './base.page';
import { ExpensesPage } from './expenses.page';

/**
 * The members x nights occupancy grid. The wizard and the Edit Expense
 * dialog both host it, so it is scoped to whichever one it sits in
 * (description-input and cancel-button also exist on Add Expense).
 *
 * Member names, per-night checkboxes and the shares/amount preview are
 * three separate tables whose rows line up by index.
 */
export class RentalGrid {
  readonly memberRows: Locator;
  readonly nightRows: Locator;
  readonly shares: Locator;
  readonly amounts: Locator;
  readonly totalShares: Locator;
  readonly totalAmount: Locator;
  readonly emptyNightsWarning: Locator;

  constructor(readonly scope: Locator) {
    this.memberRows = scope.getByTestId('member-row');
    this.nightRows = scope.getByTestId('member-nights-row');
    this.shares = scope.getByTestId('member-shares');
    this.amounts = scope.getByTestId('member-amount');
    this.totalShares = scope.getByTestId('total-shares');
    this.totalAmount = scope.getByTestId('total-amount');
    this.emptyNightsWarning = scope.getByTestId('empty-nights-warning');
  }

  /** The member names in row order. */
  async memberNames(): Promise<string[]> {
    return (await this.memberRows.allInnerTexts()).map((name) => name.trim());
  }

  /** The row index of `member` (by exact name). */
  private async rowOf(member: string): Promise<number> {
    const row = (await this.memberNames()).indexOf(member);
    if (row < 0) {
      throw new Error(`No grid row for member "${member}"`);
    }
    return row;
  }

  /** The checkbox for `member` on 0-based `night`. */
  async nightCheckbox(member: string, night: number): Promise<Locator> {
    const row = await this.rowOf(member);
    return this.nightRows
      .nth(row)
      .getByTestId('night-checkbox')
      .nth(night)
      .getByRole('checkbox');
  }

  /**
   * Ticks or unticks `member` on 0-based `night`, then waits for the
   * checkbox to show it (a Material checkbox updates on the next change
   * detection, so don't use setChecked()).
   */
  async setNight(
    member: string,
    night: number,
    present: boolean
  ): Promise<void> {
    const checkbox = await this.nightCheckbox(member, night);
    if ((await checkbox.isChecked()) !== present) {
      await checkbox.click();
    }
    await expect(checkbox).toBeChecked({ checked: present });
  }

  /** Waits for exactly `names` as the grid's rows, in order. */
  async expectMembers(names: string[]): Promise<void> {
    await expect(this.memberRows).toHaveCount(names.length);
    await expect(this.memberRows).toHaveText(names);
  }

  /** Asserts every member's shares, in row order (shown to 2 decimals). */
  async expectShares(shares: number[]): Promise<void> {
    await expect(this.shares).toHaveText(shares.map((s) => s.toFixed(2)));
  }

  /** Asserts every member's amount preview, in row order. */
  async expectAmounts(amounts: number[]): Promise<void> {
    await expect(this.amounts).toHaveText(amounts.map((a) => formatMoney(a)));
  }
}

/**
 * The Vacation Rental wizard (/expenses/rental), reached from Expenses via
 * Add New Expense, and the saved-rental parts of Edit Expense (the rental
 * banner and the Edit Occupancy Grid dialog).
 *
 * Total cost, nights, description, room name and room rate commit on blur,
 * so the fill helpers fill, blur and assert the committed value.
 */
export class RentalPage extends BasePage {
  readonly expenses: ExpensesPage;

  // Wizard
  readonly container: Locator;
  readonly grid: RentalGrid;
  readonly amountInput: Locator;
  readonly nightCountInput: Locator;
  readonly descriptionInput: Locator;
  readonly roomsToggle: Locator;
  readonly roomRows: Locator;
  readonly addRoomButton: Locator;
  readonly unassignedNote: Locator;
  readonly continueButton: Locator;
  readonly cancelButton: Locator;

  // Options dialog
  readonly rentalExpenseButton: Locator;

  // Edit Expense
  readonly editContainer: Locator;
  readonly banner: Locator;
  readonly editGridButton: Locator;
  readonly editAllocatedAmounts: Locator;
  readonly editSaveButton: Locator;
  readonly editCancelButton: Locator;
  readonly confirmButton: Locator;

  // Edit Occupancy Grid dialog
  readonly editDialog: Locator;
  readonly dialogGrid: RentalGrid;
  readonly dialogNightCountInput: Locator;
  readonly dialogSaveButton: Locator;
  readonly dialogCancelButton: Locator;

  constructor(page: Page) {
    super(page);
    this.expenses = new ExpensesPage(page);

    this.container = page.getByTestId('rental-container');
    this.grid = new RentalGrid(this.container);
    this.amountInput = this.container.getByTestId('amount-input');
    this.nightCountInput = this.container.getByTestId('night-count-input');
    this.descriptionInput = this.container.getByTestId('description-input');
    this.roomsToggle = this.container.getByTestId('rooms-enabled-toggle');
    this.roomRows = this.container.getByTestId('room-row');
    this.addRoomButton = this.container.getByTestId('add-room-button');
    this.unassignedNote = this.container.getByTestId(
      'unassigned-participants-note'
    );
    this.continueButton = this.container.getByTestId('continue-button');
    this.cancelButton = this.container.getByTestId('cancel-button');

    this.rentalExpenseButton = page.getByTestId('rental-expense-button');

    this.editContainer = page.getByTestId('edit-expense-container');
    this.banner = page.getByTestId('rental-banner');
    this.editGridButton = page.getByTestId('edit-rental-grid-button');
    this.editAllocatedAmounts = this.editContainer.getByTestId(
      'edit-allocated-amount'
    );
    this.editSaveButton = page.getByTestId('edit-expense-save-button');
    this.editCancelButton = page.getByTestId('edit-expense-cancel-button');
    this.confirmButton = page.getByTestId('confirm-button');

    this.editDialog = page.locator('app-rental-edit-dialog');
    this.dialogGrid = new RentalGrid(this.editDialog);
    this.dialogNightCountInput = this.editDialog.getByTestId(
      'rental-edit-night-count-input'
    );
    this.dialogSaveButton = this.editDialog.getByTestId(
      'rental-edit-save-button'
    );
    this.dialogCancelButton = this.editDialog.getByTestId(
      'rental-edit-cancel-button'
    );
  }

  // ---- Wizard -------------------------------------------------------------

  /**
   * From the (signed-in) Expenses list: Add New Expense, then Vacation
   * Rental. Waits until the grid has pre-filled `memberCount` members: it
   * seeds them once the group's members have loaded, and a click made
   * before then would act on an empty grid.
   */
  async openFromExpenses(memberCount: number): Promise<void> {
    await this.expenses.waitForList();
    await this.expenses.addExpenseButton.click();
    await this.rentalExpenseButton.click();
    await expect(this.page).toHaveURL(/\/expenses\/rental$/);
    await expect(this.container).toBeVisible();
    await expect(this.grid.memberRows).toHaveCount(memberCount);
  }

  /** Types the total cost; the input then shows it formatted to cents. */
  async setAmount(amount: number): Promise<void> {
    await this.fillAndCommit(
      this.amountInput,
      amount.toString(),
      amount.toFixed(2)
    );
  }

  /**
   * Sets the number of nights and waits for the grid to have that many
   * night columns (new nights start ticked for everyone).
   */
  async setNights(nights: number): Promise<void> {
    await this.fillAndCommit(this.nightCountInput, nights.toString());
    await expect(
      this.grid.nightRows.first().getByTestId('night-checkbox')
    ).toHaveCount(nights);
  }

  async setDescription(description: string): Promise<void> {
    await this.fillAndCommit(this.descriptionInput, description);
  }

  /** Ticks or unticks `member` on 0-based `night`. */
  async toggleNight(
    member: string,
    night: number,
    present: boolean
  ): Promise<void> {
    await this.grid.setNight(member, night, present);
  }

  /**
   * Turns room rates on (if they aren't), adds a room with this name and
   * rate multiplier, and makes `occupants` its occupants. The occupants
   * select is a multi-select, so its panel is closed with Escape.
   */
  async addRoom(
    name: string,
    rate: number,
    occupants: string[]
  ): Promise<void> {
    await this.setSwitch(this.roomsToggle, true);
    const index = await this.roomRows.count();
    await this.addRoomButton.click();
    await expect(this.roomRows).toHaveCount(index + 1);
    const room = this.roomRows.nth(index);

    await this.fillAndCommit(room.getByTestId('room-name-input'), name);
    await this.fillAndCommit(
      room.getByTestId('room-rate-input'),
      rate.toString()
    );

    const occupantsSelect = room.getByTestId('room-occupants-select');
    await occupantsSelect.click();
    await expect(this.selectPanel).toBeVisible();
    for (const occupant of occupants) {
      await this.option(occupant).click();
    }
    await this.page.keyboard.press('Escape');
    await expect(this.selectPanel).toBeHidden();
    await expect(occupantsSelect).toHaveText(occupants.join(', '));
  }

  /** Continues to Add Expense (router-state hand-off) and waits for its form. */
  async continueToExpense(): Promise<void> {
    await expect(this.continueButton).toBeEnabled();
    await this.continueButton.click();
    await expect(this.page).toHaveURL(/\/expenses\/add$/);
    await expect(this.expenses.addExpenseContainer).toBeVisible();
    await this.waitForLoadingComplete();
  }

  // ---- Saved rental (Edit Expense) ----------------------------------------

  /**
   * From the Expenses list, opens the expense with this (unique)
   * description and waits for Edit Expense to show its rental banner.
   */
  async openSavedRental(description: string): Promise<void> {
    const row = this.expenses.expenseRow(description);
    await expect(row).toHaveCount(1);
    await row.click();
    await expect(this.page).toHaveURL(/\/expenses\/[^/]+$/);
    await expect(this.editContainer).toBeVisible();
    await this.waitForLoadingComplete();
    await expect(this.banner).toBeVisible();
  }

  /** Opens the Edit Occupancy Grid dialog and waits for `memberCount` rows. */
  async openEditDialog(memberCount: number): Promise<void> {
    await this.editGridButton.click();
    await expect(this.editDialog).toBeVisible();
    await expect(this.dialogGrid.memberRows).toHaveCount(memberCount);
  }

  async saveEditDialog(): Promise<void> {
    await expect(this.dialogSaveButton).toBeEnabled();
    await this.dialogSaveButton.click();
    await expect(this.editDialog).toBeHidden();
  }

  async cancelEditDialog(): Promise<void> {
    await this.dialogCancelButton.click();
    await expect(this.editDialog).toBeHidden();
  }

  /**
   * Saves the edited expense: Save, confirm the "will mark all splits as
   * unpaid" dialog, then waits for the success snackbar and the Expenses
   * list.
   */
  async saveEditedExpense(): Promise<void> {
    await expect(this.editSaveButton).toBeEnabled();
    await this.editSaveButton.click();
    await expect(this.page.getByTestId('confirmation-text')).toContainText(
      'will mark all splits as unpaid'
    );
    await this.confirmButton.click();
    await expect(
      this.snackbarWith('Expense updated successfully')
    ).toBeVisible();
    await expect(this.page).toHaveURL(/\/expenses$/);
    await this.expenses.waitForList();
  }

  /** Cancels Edit Expense and waits for the (loaded) Expenses list. */
  async cancelEditedExpense(): Promise<void> {
    await this.editCancelButton.click();
    await expect(this.page).toHaveURL(/\/expenses$/);
    await this.expenses.waitForList();
  }
}
