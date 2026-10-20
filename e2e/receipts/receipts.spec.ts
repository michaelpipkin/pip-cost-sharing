import path from 'node:path';
import {
  allocateSharedAmounts,
  makeRounder,
} from '../../scripts/db/allocation';
import { expect, test } from '../fixtures';
import { ExpensesPage } from '../pages/expenses.page';
import { ScanReceiptPage } from '../pages/scan-receipt.page';
import { RECEIPTS } from '../seed/datasets/receipts';
import { FIXTURE_FILES_DIR, storageObjectExists } from '../seed/storage';
import { formatMoney } from '../utils/format';
import { mockScanReceipt } from '../utils/scan-receipt-mock';
import { signInAs } from '../utils/session';
import {
  TEST_PORTS,
  TEST_STORAGE_BUCKET,
} from '../../scripts/test-env/config.mjs';

// Each test signs in as the owner of its own group (see
// e2e/seed/datasets/receipts.ts); the policy test accepts the receipt policy
// on its own user because that state is one-way. The scanReceipt callable is
// always mocked: the real function downloads tesseract data from a CDN and
// its OCR output isn't deterministic.
//
// Storage objects are asserted at groups/<group>/receipts/<expense id>, the
// path ExpenseService.addExpense uploads to. Expense ids are generated, so
// the id is read from the URL of the row's Edit Expense page.
//
// Scan test numbers: Burger 20 (Blake), Salad 10 (Cody), Nachos 6
// (unassigned), tax 3 + tip 6, total 45. On Add Expense the $6 is shared
// evenly (3 each) and the $9 is spread in proportion to each member's base
// (20 + 3 and 10 + 3), which allocateSharedAmounts (scripts/db/allocation.ts
// ports it) turns into Blake 28.75 and Cody 16.25.

const RECEIPT_FILE = path.join(FIXTURE_FILES_DIR, 'receipt.png');
const RECEIPT_FILE_NAME = 'receipt.png';
const CHECK_MARK = '✔';

const receiptPath = (groupKey: string, expenseId: string) =>
  `groups/${groupKey}/receipts/${expenseId}`;

/** getDownloadURL's result on the test Storage emulator (host is localhost or 127.0.0.1). */
function downloadUrlPattern(objectPath: string): RegExp {
  const prefix = `/v0/b/${TEST_STORAGE_BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media`;
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `^http://(localhost|127\\.0\\.0\\.1):${TEST_PORTS.storage}${escapedPrefix}`
  );
}

test.describe('Receipts', { tag: ['@receipts'] }, () => {
  test('should attach a receipt to a new expense', async ({ page }) => {
    const description = `Attach – Lunch ${Date.now()}`;
    const expenses = new ExpensesPage(page);

    await signInAs(page, RECEIPTS.users.attach);
    await expenses.gotoAddExpense();
    await expenses.fillExpenseForm({
      description,
      category: 'Travel',
      amount: 25,
    });
    await expenses.addAllMembers();
    await expect(expenses.uploadPrompt).toBeVisible();
    await expenses.uploadReceipt(RECEIPT_FILE);
    await expect(expenses.attachedFilename).toHaveText(RECEIPT_FILE_NAME);
    // Removing it returns to the prompt; attach again before saving.
    await expenses.removeReceipt();
    await expenses.uploadReceipt(RECEIPT_FILE);
    await expect(expenses.attachedFilename).toHaveText(RECEIPT_FILE_NAME);
    await expenses.saveExpense();

    await expect(expenses.receiptIndicator(description)).toHaveText(
      CHECK_MARK
    );
    const expenseId = await expenses.openExpense(description);
    await expect
      .poll(() =>
        storageObjectExists(receiptPath(RECEIPTS.groups.attach.key, expenseId))
      )
      .toBe(true);
    await expect(expenses.viewReceiptLink).toBeVisible();
  });

  test('should ask for the receipt policy once, then open the file picker', async ({
    page,
  }) => {
    const description = `Policy – Taxi ${Date.now()}`;
    const expenses = new ExpensesPage(page);
    const picker = expenses.picker;

    await signInAs(page, RECEIPTS.users.policy);
    await expenses.gotoAddExpense();
    await expenses.fillExpenseForm({
      description,
      category: 'Travel',
      amount: 18,
    });
    await expenses.addAllMembers();

    // First attach: the policy dialog gates the picker until it's accepted.
    await expenses.attachFileButton.click();
    await expect(picker.policyDialog).toBeVisible();
    await expect(picker.sourceDialog).toBeHidden();
    await expect(picker.acceptButton).toBeDisabled();
    await picker.acceptPolicy();
    await picker.browseFiles(RECEIPT_FILE);
    await expect(expenses.attachedFilename).toHaveText(RECEIPT_FILE_NAME);
    await expenses.saveExpense();
    await expect(expenses.receiptIndicator(description)).toHaveText(
      CHECK_MARK
    );

    // Second time: the policy was saved, so Attach goes straight to the picker.
    await expenses.openAddExpense();
    await expenses.attachFileButton.click();
    await expect(picker.sourceDialog).toBeVisible();
    await expect(picker.policyDialog).toBeHidden();
    await picker.cancelSourceButton.click();
    await expect(picker.sourceDialog).toBeHidden();
    await expect(expenses.uploadPrompt).toBeVisible();
  });

  test('should show a stored receipt on the expense', async ({ page }) => {
    const { key: groupKey } = RECEIPTS.groups.view;
    const { description, key: seededId } = RECEIPTS.viewExpense;
    const expenses = new ExpensesPage(page);

    await signInAs(page, RECEIPTS.users.view);
    await expenses.navigateToList();
    await expect(expenses.receiptIndicator(description)).toHaveText(
      CHECK_MARK
    );
    const expenseId = await expenses.openExpense(description);
    expect(expenseId).toBe(seededId);
    expect(await storageObjectExists(receiptPath(groupKey, expenseId))).toBe(
      true
    );

    // The link is filled by getDownloadURL: an emulator URL that serves the file.
    await expect(expenses.viewReceiptLink).toBeVisible();
    await expect(expenses.viewReceiptLink).toHaveAttribute(
      'href',
      downloadUrlPattern(receiptPath(groupKey, expenseId))
    );
    const url = (await expenses.viewReceiptLink.getAttribute('href'))!;
    const response = await page.request.get(url);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');

    // An existing receipt can be replaced: the edit form's own attach
    // controls (nothing is saved).
    await expect(expenses.editAttachFileButton).toBeVisible();
    await expenses.editFileInput.setInputFiles(RECEIPT_FILE);
    await expect(expenses.editAttachedFilename).toHaveText(RECEIPT_FILE_NAME);
    await expenses.editRemoveFileButton.click();
    await expect(expenses.editAttachedFilename).toBeHidden();
    await expect(expenses.editAttachFileButton).toBeVisible();
  });

  test('should create an expense from a scanned receipt', async ({ page }) => {
    const description = `Scan – Corner Cafe ${Date.now()}`;
    const expenses = new ExpensesPage(page);
    const scan = new ScanReceiptPage(page);
    const form = expenses.form;
    await mockScanReceipt(page, {
      total: 45,
      subtotal: 36,
      tax: 3,
      tip: 6,
      lineItems: [
        { description: 'Burger', amount: 20, confidence: 95 },
        { description: 'Salad', amount: 10, confidence: 95 },
        { description: 'Nachos', amount: 6, confidence: 95 },
      ],
      rawText: [description, 'Burger 20.00', 'Salad 10.00', 'Nachos 6.00'].join(
        '\n'
      ),
    });

    await signInAs(page, RECEIPTS.users.scan);
    await expenses.navigateToList();
    await scan.openFromList();
    await scan.scanFile(RECEIPT_FILE);

    await expect(scan.lineItemRows).toHaveCount(3);
    await expect(scan.scannedFilename).toHaveText(RECEIPT_FILE_NAME);
    await expect(scan.descriptionInput).toHaveValue(description);
    await expect(scan.totalAmountInput).toHaveValue('45.00');
    await expect(scan.taxAmountInput).toHaveValue('3.00');
    await expect(scan.tipAmountInput).toHaveValue('6.00');

    // Two items assigned, one left unassigned.
    await scan.assignItem(0, 'Blake');
    await scan.assignItem(1, 'Cody');
    await expect(scan.assignee(2)).toHaveText('Shared / No one');
    await scan.expectTotals({
      members: [
        { member: 'Blake', amount: 20 },
        { member: 'Cody', amount: 10 },
      ],
      unassigned: 6,
      taxTip: 9,
    });

    // Hand-off: Add Expense arrives prefilled (a reload would show it blank,
    // with no splits and no attached file).
    await scan.continueToAddExpense();
    await expect(form.payerSelect).toHaveText('Ari');
    await expect(form.descriptionInput).toHaveValue(description);
    await expect(form.totalAmountInput).toHaveValue('45.00');
    await expect(form.proportionalAmountInput).toHaveValue('9.00');
    await expect(form.sharedRemainderAmount).toContainText(formatMoney(6));
    await expect(expenses.attachedFilename).toHaveText(RECEIPT_FILE_NAME);
    await expect(form.splitRows).toHaveText(['Blake', 'Cody']);
    await expect(form.assignedAmountInputs).toHaveCount(2);
    await expect(form.assignedAmountInputs.nth(0)).toHaveValue('20.00');
    await expect(form.assignedAmountInputs.nth(1)).toHaveValue('10.00');
    const allocated = allocateSharedAmounts(
      {
        totalAmount: 45,
        sharedAmount: 6,
        allocatedAmount: 9,
        splits: [20, 10].map((assignedAmount) => ({
          assignedAmount,
          owedByMemberRef: {},
          percentage: 0,
          shares: 0,
          allocatedAmount: 0,
        })),
      },
      makeRounder(2)
    ).splits.map((s) => s.allocatedAmount);
    expect(allocated).toEqual([28.75, 16.25]);
    await form.expectAllocatedAmounts(allocated);

    // The scan doesn't pick a category (the group has two).
    await form.selectCategory('Travel');
    await expenses.saveExpense();

    await expect(expenses.receiptIndicator(description)).toHaveText(
      CHECK_MARK
    );
    await expenses.expectSavedExpense(description, {
      payer: 'Ari',
      category: 'Travel',
      total: 45,
      splits: [
        { member: 'Blake', amount: allocated[0]! },
        { member: 'Cody', amount: allocated[1]! },
      ],
    });
    const expenseId = await expenses.openExpense(description);
    await expect
      .poll(() =>
        storageObjectExists(receiptPath(RECEIPTS.groups.scan.key, expenseId))
      )
      .toBe(true);
  });

  test('should explain an unreadable receipt', async ({ page }) => {
    const expenses = new ExpensesPage(page);
    const scan = new ScanReceiptPage(page);
    await mockScanReceipt(page, { error: 'no-text-found' });

    await signInAs(page, RECEIPTS.users.scan);
    await expenses.navigateToList();
    await scan.openFromList();
    await scan.scanFile(RECEIPT_FILE);

    await expect(scan.notReadableDialog).toBeVisible();
    await expect(
      scan.notReadableDialog.getByTestId('confirmation-text')
    ).toContainText("couldn't find any readable text in that image");

    // Closing it offers the source picker again; cancelling that leaves the
    // page as it started: nothing scanned, nothing to continue with.
    await scan.notReadableDialog.getByTestId('confirm-button').click();
    await expect(scan.notReadableDialog).toBeHidden();
    await expect(scan.picker.sourceDialog).toBeVisible();
    await scan.picker.cancelSourceButton.click();
    await expect(scan.picker.sourceDialog).toBeHidden();
    await expect(scan.placeholder).toBeVisible();
    await expect(scan.lineItemRows).toHaveCount(0);
    await expect(scan.continueButton).toBeHidden();

    // ... and it is usable: Select Receipt Photo opens the picker again.
    await expect(scan.selectPhotoButton).toBeEnabled();
    await scan.selectPhotoButton.click();
    await expect(scan.picker.sourceDialog).toBeVisible();
    await scan.picker.cancelSourceButton.click();
    await expect(scan.picker.sourceDialog).toBeHidden();
  });
});
