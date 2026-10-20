import { expect, test } from '../fixtures';
import { SplitPage } from '../pages/split.page';
import { readClipboard } from '../utils/clipboard';
import { formatMoney } from '../utils/format';

// No seed data: /split is public, signed out, and stores nothing, so every
// test builds its own form in a fresh page. Expected amounts come from
// AllocationUtilsService (scripts/db/allocation.ts ports it) and
// RentalUtilsService.computeShares:
//   - amount mode: personal amounts first, then the remainder is shared
//     evenly among every named person (a fixed amount is on top of the
//     even share, not instead of it);
//   - percentage mode: the last person's percentage is the remainder;
//   - rental shares: each night is a pool of one share per participant,
//     divided among the people there that night.

test.describe('Split tool', { tag: ['@split'] }, () => {
  test('should split an amount evenly with one fixed share and summarize it', async ({
    page,
  }) => {
    const split = new SplitPage(page);
    await split.gotoSplit();

    // 90 total, Ari has 30 of her own: the other 60 is shared three ways
    // (20 each), so Ari owes 30 + 20 and Blake and Cody 20 each.
    await split.setTotal(90);
    await split.addPerson('Ari', 30);
    await split.addPerson('Blake');
    await split.addPerson('Cody');
    await split.expectAllocatedAmounts([50, 20, 20]);
    await expect(split.sharedRemainder).toContainText(formatMoney(60));

    await split.generateSummary();
    await expect(split.summaryLines).toHaveText([
      `Ari: ${formatMoney(50)}`,
      `Blake: ${formatMoney(20)}`,
      `Cody: ${formatMoney(20)}`,
    ]);

    // Edit Split keeps everything that was entered.
    await split.editSplit();
    await expect(split.totalAmountInput).toHaveValue('90.00');
    await split.expectValues(split.nameInputs, ['Ari', 'Blake', 'Cody']);
    await split.expectValues(split.memberAmountInputs, [
      '30.00',
      '0.00',
      '0.00',
    ]);
    await split.expectAllocatedAmounts([50, 20, 20]);

    // Start Over clears the form.
    await split.generateSummary();
    await split.startOver();
    await expect(split.totalAmountInput).toHaveValue('0.00');
    await expect(split.nameInputs).toHaveCount(0);
    await expect(split.generateSummaryButton).toBeDisabled();
  });

  test('should split by percentage and by shares', async ({ page }) => {
    const split = new SplitPage(page);
    await split.gotoSplit();

    await split.setTotal(200);
    await split.addPerson('Ari');
    await split.addPerson('Blake');
    await split.addPerson('Cody');

    // Percentages: Ari 50, Blake 30; Cody's 20 is computed (the last
    // person always takes the remainder).
    await split.setMethod('percentage');
    await split.setPercentage(0, 50);
    await split.setPercentage(1, 30);
    await expect(split.percentageInputs.nth(2)).toHaveValue('20');
    await expect(split.percentageInputs.nth(2)).toBeEditable({
      editable: false,
    });
    await split.expectAllocatedAmounts([100, 60, 40]);

    // Shares: 2 / 1 / 1 of 100.
    await split.setMethod('shares');
    await split.setTotal(100);
    await split.setShares(0, 2);
    await split.setShares(1, 1);
    await split.setShares(2, 1);
    await split.expectAllocatedAmounts([50, 25, 25]);

    await split.generateSummary();
    await expect(split.summaryLines).toHaveText([
      `Ari (2 shares, 50.00%): ${formatMoney(50)}`,
      `Blake (1 shares, 25.00%): ${formatMoney(25)}`,
      `Cody (1 shares, 25.00%): ${formatMoney(25)}`,
    ]);
  });

  test('should apply a vacation rental grid as shares', async ({ page }) => {
    const split = new SplitPage(page);
    await split.gotoSplit();

    await split.setTotal(600);
    await split.addPerson('Ari');
    await split.addPerson('Blake');
    await split.addPerson('Cody');
    await split.enterRentalMode();
    await split.setNightCount(2);

    // The people already entered seed the grid, present every night.
    await expect(split.participantRows).toHaveText(['Ari', 'Blake', 'Cody']);
    // In rental mode the proportional field and remainder are hidden, not
    // removed.
    await expect(split.proportionalAmountInput).toBeHidden();
    await expect(split.sharedRemainder).toBeHidden();

    // Cody misses night 2. Night 1 gives everyone 1 share; night 2 splits
    // the 3-share pool between Ari and Blake (1.5 each): 2.5 / 2.5 / 1.
    await split.setPresent(2, 1, false);
    await expect(split.participantShares).toHaveText(['2.50', '2.50', '1.00']);
    await expect(split.participantAmounts).toHaveText([
      formatMoney(250),
      formatMoney(250),
      formatMoney(100),
    ]);

    await split.applyShares();
    await expect(
      split.splitMethodToggles.shares.getByRole('radio')
    ).toBeChecked();
    await split.expectValues(split.sharesInputs, ['2.5', '2.5', '1']);
    await split.expectAllocatedAmounts([250, 250, 100]);
    await expect(split.generateSummaryButton).toBeEnabled();
  });

  test('should copy the summary', async ({ seededPage: page }) => {
    const split = new SplitPage(page);
    await split.gotoSplit();

    await split.setTotal(90);
    await split.addPerson('Ari', 30);
    await split.addPerson('Blake');
    await split.addPerson('Cody');
    await split.generateSummary();

    await split.copySummaryButton.click();
    await expect(split.snackbarWith('Summary copied to clipboard')).toBeVisible();

    const copied = await readClipboard(page);
    expect(copied).toContain('Total: $90.00');
    // Each person's line, padded so the amounts line up.
    expect(copied).toMatch(/^Ari:\s+\$50\.00$/m);
    expect(copied).toMatch(/^Blake:\s+\$20\.00$/m);
    expect(copied).toMatch(/^Cody:\s+\$20\.00$/m);
  });

  test('should keep Generate Summary disabled until fully allocated', async ({
    page,
  }) => {
    const split = new SplitPage(page);
    await split.gotoSplit();

    // Nothing entered.
    await expect(split.generateSummaryButton).toBeDisabled();

    // A total but nobody to split it between.
    await split.setTotal(90);
    await expect(split.generateSummaryButton).toBeDisabled();

    // A split row without a name is left out of the allocation.
    await split.addSplitButton.click();
    await expect(split.nameInputs).toHaveCount(1);
    await split.expectAllocatedAmounts([0]);
    await expect(split.generateSummaryButton).toBeDisabled();

    // Naming the person allocates the whole total to them.
    await split.nameInputs.first().fill('Ari');
    await split.nameInputs.first().blur();
    await split.expectAllocatedAmounts([90]);
    await expect(split.generateSummaryButton).toBeEnabled();

    // By shares nothing is allocated until someone has shares.
    await split.setMethod('shares');
    await split.expectAllocatedAmounts([0]);
    await expect(split.generateSummaryButton).toBeDisabled();
    await split.setShares(0, 1);
    await split.expectAllocatedAmounts([90]);
    await expect(split.generateSummaryButton).toBeEnabled();
  });

  // App bug: personal amounts that add up to more than the total push the
  // evenly shared remainder negative, so the others are "allocated" a
  // negative amount (Ari 95, Blake -5) and the total still reconciles, which
  // is all expenseFullyAllocated() checks. Neither the split page nor the
  // group expense forms guard against it, so Generate Summary stays
  // enabled. It should stay disabled while the personal amounts exceed the
  // total. Remove test.fail() once the app blocks it.
  test('should keep Generate Summary disabled when fixed shares exceed the total', async ({
    page,
  }) => {
    test.fail();
    const split = new SplitPage(page);
    await split.gotoSplit();

    await split.setTotal(90);
    await split.addPerson('Ari', 100);
    await split.addPerson('Blake');
    await expect(split.generateSummaryButton).toBeDisabled();
  });
});
