import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * The "Update your group emails?" dialog the app offers after a login-email
 * change (B20). Scoped to the dialog so its test ids can't match anything
 * behind it.
 */
export class GroupEmailUpdateDialog extends BasePage {
  readonly dialog: Locator;
  readonly title: Locator;
  readonly intro: Locator;
  readonly oldLine: Locator;
  readonly otherLine: Locator;
  readonly allHelp: Locator;
  readonly oldOnlyHelp: Locator;
  readonly laterNote: Locator;
  readonly notNowButton: Locator;
  readonly oldOnlyButton: Locator;
  readonly updateAllButton: Locator;

  constructor(page: Page) {
    super(page);
    this.dialog = page.getByRole('dialog').filter({
      has: page.getByTestId('group-email-update-title'),
    });
    this.title = this.dialog.getByTestId('group-email-update-title');
    this.intro = this.dialog.getByTestId('group-email-update-intro');
    this.oldLine = this.dialog.getByTestId('group-email-update-old-line');
    this.otherLine = this.dialog.getByTestId('group-email-update-other-line');
    this.allHelp = this.dialog.getByTestId('group-email-update-all-help');
    this.oldOnlyHelp = this.dialog.getByTestId(
      'group-email-update-old-only-help'
    );
    this.laterNote = this.dialog.getByTestId('group-email-update-later-note');
    this.notNowButton = this.dialog.getByTestId(
      'group-email-update-not-now-button'
    );
    this.oldOnlyButton = this.dialog.getByTestId(
      'group-email-update-old-only-button'
    );
    this.updateAllButton = this.dialog.getByTestId(
      'group-email-update-all-button'
    );
  }

  /** Waits for the dialog, which opens once the memberships are counted. */
  async expectOpen(): Promise<void> {
    await expect(this.title).toHaveText('Update your group emails?');
  }

  /** Clicks a button and waits for the dialog to close and loading to end. */
  async choose(button: Locator): Promise<void> {
    await button.click();
    await expect(this.dialog).toBeHidden();
    await this.waitForLoadingComplete();
  }
}
