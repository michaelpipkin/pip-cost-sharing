import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import { CategoriesPage } from '../pages/categories.page';
import { ExpensesPage } from '../pages/expenses.page';
import { HistoryPage } from '../pages/history.page';
import { MembersPage } from '../pages/members.page';
import { MemorizedPage } from '../pages/memorized.page';
import { RentalPage } from '../pages/rental.page';
import { ScanReceiptPage } from '../pages/scan-receipt.page';
import { SplitPage } from '../pages/split.page';
import { SummaryPage } from '../pages/summary.page';
import { TourCard } from '../pages/tour';
import { TOURS } from '../seed/datasets/tours';
import { formatMoney } from '../utils/format';
import { signInAs } from '../utils/session';

// Guided tours (src/app/shared/components/guided-tour). Read-only: a tour
// never writes, so every row signs in as tours-user and reaches its page
// in-app, as a user does (rental, scan-receipt, add/edit expense, add/edit
// memorized and the payment detail depend on router state a page.goto would
// lose; see e2e/seed/datasets/tours.ts).
//
// Tours skip steps by role and data, so no step count is written down: the
// walk reads "N of M" from the card and clicks until "M of M". Each row's
// firstTitle comes from the page's *.tour.ts (the add/edit expense and
// memorized forms share expense-form.tour.ts but have their own intro).
test.use({ reducedMotion: 'reduce' });

const { expense, memorized: memorizedDoc } = TOURS;

interface TourRow {
  /** The page, for the test title. */
  page: string;
  /** Playwright tags beyond @help: the page's area. */
  area: '@expenses' | '@rental' | '@receipts' | '@members' | '@categories' | '@memorized' | '@summary' | '@history' | '@split';
  /** The page's help control, which starts its tour. */
  helpTestId: string;
  /** The first step's title (read from the page's tour file). */
  firstTitle: string;
  /** Signed in as tours-user; false for the public Split page. */
  signedIn?: false;
  /** Reaches the page in-app from the signed-in landing page (Expenses). */
  open: (page: Page) => Promise<void>;
  /** The page shows its real data again once the tour has ended. */
  expectRestored: (page: Page) => Promise<void>;
}

const ROWS: TourRow[] = [
  {
    page: 'expenses',
    area: '@expenses',
    helpTestId: 'expenses-help-button',
    firstTitle: 'Expenses', // expenses.tour.ts:31
    open: (page) => new ExpensesPage(page).waitForList(),
    expectRestored: async (page) => {
      const expenses = new ExpensesPage(page);
      await expect(expenses.expenseRow(expense.description)).toBeVisible();
      await expect(expenses.expenseDetail).toHaveCount(0);
    },
  },
  {
    page: 'add expense',
    area: '@expenses',
    helpTestId: 'help-button',
    firstTitle: 'Adding an expense', // expense-form.tour.ts:202
    open: (page) => new ExpensesPage(page).gotoAddExpense(),
    expectRestored: async (page) => {
      // The tour filled in a sample dinner; the blank form comes back.
      const expenses = new ExpensesPage(page);
      await expect(expenses.payerSelect).toHaveText('Ari');
      await expect(expenses.descriptionInput).toHaveValue('');
      await expect(expenses.splitRows).toHaveCount(0);
    },
  },
  {
    page: 'edit expense',
    area: '@expenses',
    helpTestId: 'edit-expense-help-button',
    firstTitle: 'Editing an expense', // expense-form.tour.ts:202
    open: async (page) => {
      const expenses = new ExpensesPage(page);
      await expenses.waitForList();
      await expenses.openExpense(expense.description);
    },
    expectRestored: async (page) => {
      // The tour switched split methods and put them back.
      await expect(page.getByTestId('edit-description-input')).toHaveValue(
        expense.description
      );
      await expect(page.getByTestId('edit-total-amount-input')).toHaveValue(
        '40.00'
      );
      await expect(page.getByTestId('edit-allocated-amount')).toHaveText([
        formatMoney(20),
        formatMoney(20),
      ]);
    },
  },
  {
    page: 'vacation rental',
    area: '@rental',
    helpTestId: 'help-button',
    firstTitle: 'Vacation rental', // rental.tour.ts:19
    open: (page) => new RentalPage(page).openFromExpenses(2),
    expectRestored: async (page) => {
      // The tour switched to three sample people and room rates.
      const rental = new RentalPage(page);
      await rental.grid.expectMembers(['Ari', 'Blake']);
      await expect(rental.roomRows).toHaveCount(0);
    },
  },
  {
    page: 'scan receipt',
    area: '@receipts',
    helpTestId: 'help-button',
    firstTitle: 'Expense from a receipt', // scan-receipt.tour.ts:19
    open: async (page) => {
      await new ExpensesPage(page).waitForList();
      await new ScanReceiptPage(page).openFromList();
    },
    expectRestored: async (page) => {
      // The tour showed a sample scan; nothing is scanned.
      const scan = new ScanReceiptPage(page);
      await expect(scan.placeholder).toBeVisible();
      await expect(scan.lineItemRows).toHaveCount(0);
    },
  },
  {
    page: 'members',
    area: '@members',
    helpTestId: 'members-help-button',
    firstTitle: 'Members', // members.tour.ts:30
    open: (page) => new MembersPage(page).goto(),
    expectRestored: async (page) => {
      const members = new MembersPage(page);
      await expect(members.row('blake')).toBeVisible();
      await expect(members.row('ari')).toBeVisible();
    },
  },
  {
    page: 'categories',
    area: '@categories',
    helpTestId: 'categories-help-button',
    firstTitle: 'Categories', // categories.tour.ts:26
    open: (page) => new CategoriesPage(page).goto(),
    expectRestored: async (page) => {
      const categories = new CategoriesPage(page);
      await expect(categories.rowById('general')).toBeVisible();
      await expect(categories.rowById('travel')).toBeVisible();
    },
  },
  {
    page: 'memorized expenses',
    area: '@memorized',
    helpTestId: 'memorized-help-button',
    firstTitle: 'Memorized expenses', // memorized.tour.ts:20
    open: (page) => new MemorizedPage(page).navigateToList(),
    expectRestored: async (page) => {
      const memorized = new MemorizedPage(page);
      await expect(memorized.row(memorizedDoc.description)).toBeVisible();
      // The tour expanded the first row; it is collapsed again.
      await expect(memorized.detailSplitRows).toHaveCount(0);
    },
  },
  {
    page: 'add memorized expense',
    area: '@memorized',
    helpTestId: 'add-memorized-help-button',
    firstTitle: 'Memorizing an expense', // expense-form.tour.ts:202
    open: async (page) => {
      const memorized = new MemorizedPage(page);
      await memorized.navigateToList();
      await memorized.openNew();
    },
    expectRestored: async (page) => {
      const form = new MemorizedPage(page).addForm;
      await expect(form.payerSelect).toHaveText('Ari');
      await expect(form.descriptionInput).toHaveValue('');
      await expect(form.splitRows).toHaveCount(0);
    },
  },
  {
    page: 'edit memorized expense',
    area: '@memorized',
    helpTestId: 'edit-memorized-help-button',
    firstTitle: 'Editing a memorized expense', // expense-form.tour.ts:202
    open: async (page) => {
      const memorized = new MemorizedPage(page);
      await memorized.navigateToList();
      await memorized.openEdit(memorizedDoc.description);
    },
    expectRestored: async (page) => {
      const form = new MemorizedPage(page).editForm;
      await expect(form.descriptionInput).toHaveValue(
        memorizedDoc.description
      );
      await expect(form.totalAmountInput).toHaveValue('100.00');
      await expect(form.splitRows).toHaveText(['Ari', 'Blake']);
    },
  },
  {
    page: 'summary',
    area: '@summary',
    helpTestId: 'summary-help-button',
    firstTitle: 'Summary', // summary.tour.ts:37
    open: (page) => new SummaryPage(page).goto(),
    expectRestored: async (page) => {
      // Real balances (Blake owes Ari for the unpaid dinner), no sample rows.
      const summary = new SummaryPage(page);
      await expect(summary.summaryRows).toHaveCount(1);
      await expect(summary.owedByCells).toHaveText(['Blake']);
      await expect(summary.owedToCells).toHaveText(['Ari']);
      await expect(summary.detail).toHaveCount(0);
    },
  },
  {
    page: 'history',
    area: '@history',
    helpTestId: 'history-help-button',
    firstTitle: 'History', // history.tour.ts:15
    open: (page) => new HistoryPage(page).goto(),
    expectRestored: async (page) => {
      const history = new HistoryPage(page);
      await expect(history.historyRows).toHaveCount(1);
      await expect(history.paidByCells).toHaveText(['Blake']);
      await expect(history.paidToCells).toHaveText(['Ari']);
    },
  },
  {
    page: 'payment detail',
    area: '@history',
    helpTestId: 'history-detail-help-button',
    firstTitle: 'Payment detail', // history-detail.tour.ts:23
    open: async (page) => {
      const history = new HistoryPage(page);
      await history.goto();
      await history.openDetail(0);
    },
    expectRestored: async (page) => {
      const history = new HistoryPage(page);
      await expect(history.paidByName).toHaveText('Paid By: Blake');
      await expect(history.paidToName).toHaveText('Paid To: Ari');
      await expect(history.splitRows).toHaveCount(1);
    },
  },
  {
    page: 'split',
    area: '@split',
    helpTestId: 'split-help-button',
    firstTitle: 'Split an expense', // split.tour.ts:24
    signedIn: false,
    open: (page) => new SplitPage(page).gotoSplit(),
    expectRestored: async (page) => {
      // The tour filled in a sample; the blank calculator comes back.
      const split = new SplitPage(page);
      await expect(split.totalAmountInput).toHaveValue('0.00');
      await expect(split.nameInputs).toHaveCount(0);
    },
  },
];

test.describe('Guided tours', { tag: ['@help'] }, () => {
  for (const row of ROWS) {
    test(
      `should walk the ${row.page} tour`,
      { tag: [row.area] },
      async ({ page }) => {
        const tour = new TourCard(page);

        if (row.signedIn !== false) {
          await signInAs(page, TOURS.user);
        }
        await row.open(page);

        await tour.start(page.getByTestId(row.helpTestId));
        await expect(tour.title).toHaveText(row.firstTitle);
        expect((await tour.stepCount()).step).toBe(1);
        await expect(tour.spotlight).toBeVisible();
        await expect(tour.backButton).toBeHidden();

        const total = await tour.walkToEnd();
        expect(total).toBeGreaterThan(1);

        await tour.next(); // Done
        await expect(tour.title).toBeHidden();
        await expect(tour.spotlight).toBeHidden();
        await expect(page.locator('mat-dialog-container')).toHaveCount(0);
        await row.expectRestored(page);
      }
    );
  }

  test(
    'should navigate a tour with buttons and keys',
    { tag: ['@split'] },
    async ({ page }) => {
      const split = new SplitPage(page);
      const tour = new TourCard(page);

      await split.gotoSplit();
      await tour.start(page.getByTestId('split-help-button'));
      const firstTitle = await tour.title.innerText();
      await tour.expectStep(1);
      // Nothing to go back to on the first step.
      await expect(tour.backButton).toBeHidden();

      // Buttons: Next, then Back returns to the first step.
      await tour.next();
      await expect(tour.title).not.toHaveText(firstTitle);
      await tour.expectStep(2);
      await expect(tour.backButton).toBeVisible();
      await tour.back();
      await expect(tour.title).toHaveText(firstTitle);
      await tour.expectStep(1);
      await expect(tour.backButton).toBeHidden();

      // Keys: ArrowRight moves on, ArrowLeft moves back.
      await page.keyboard.press('ArrowRight');
      await tour.expectStep(2);
      await expect(tour.title).not.toHaveText(firstTitle);
      await page.keyboard.press('ArrowLeft');
      await tour.expectStep(1);
      await expect(tour.title).toHaveText(firstTitle);

      // Esc ends the tour.
      await page.keyboard.press('Escape');
      await expect(tour.title).toBeHidden();
      await expect(tour.spotlight).toBeHidden();

      // The close button ends it part-way through, too.
      await tour.start(page.getByTestId('split-help-button'));
      await tour.next();
      await tour.expectStep(2);
      await tour.close();
      await expect(tour.title).toBeHidden();
      await expect(tour.spotlight).toBeHidden();
      await expect(split.addSplitButton).toBeEnabled();
    }
  );

  test(
    'should open full help from the last step',
    { tag: ['@members'] },
    async ({ page }) => {
      const members = new MembersPage(page);
      const tour = new TourCard(page);
      const helpTitle = page.getByTestId('help-dialog-title');

      await signInAs(page, TOURS.user);
      await members.goto();
      await tour.start(members.helpButton);

      // "Read full help" is for the last step only.
      await expect(tour.fullHelpButton).toBeHidden();
      await tour.next();
      await tour.expectStep(2);
      await expect(tour.fullHelpButton).toBeHidden();
      await tour.walkToEnd();
      await expect(tour.fullHelpButton).toBeVisible();

      await tour.fullHelpButton.click();
      await expect(helpTitle).toHaveText('Members Help');
      await expect(tour.title).toBeHidden();
      await expect(tour.spotlight).toBeHidden();

      await page.getByTestId('help-dialog-close-button').click();
      await expect(helpTitle).toBeHidden();
      await expect(page.locator('mat-dialog-container')).toHaveCount(0);
      await expect(members.row('blake')).toBeVisible();
    }
  );
});
