import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './base.page';

/** The four payment service IDs, as the Payments section shows them. */
export interface PaymentIds {
  venmo: string;
  paypal: string;
  cashApp: string;
  zelle: string;
}

/** A section of the account sidebar, by its nav-<section> test id. */
export type AccountSection =
  | 'profile'
  | 'security'
  | 'payments'
  | 'legal'
  | 'group-membership';

/**
 * The account area (/auth/account/...): reached from the header's account
 * button, then the sidebar links. Preferences is the exception - it has no
 * sidebar link, so it is opened by URL once the account page has rendered.
 *
 * Save actions end by waiting for the snackbar the save shows.
 */
export class AccountPage extends BasePage {
  readonly navAccountLink: Locator;
  readonly logoutButton: Locator;
  readonly loginLink: Locator;
  readonly sidebar: Locator;

  // Profile
  readonly emailNotificationsToggle: Locator;
  readonly emailInput: Locator;
  readonly updateEmailButton: Locator;
  readonly verifyEmailButton: Locator;
  readonly syncMemberEmails: Locator;
  /** The help text above the Sync Member Emails button. */
  readonly syncMemberEmailsHelp: Locator;
  /** "We sent a link to <new>..." after Update Email (verify before update). */
  readonly pendingEmailChange: Locator;

  // Payments
  readonly venmoInput: Locator;
  readonly paypalInput: Locator;
  readonly cashAppInput: Locator;
  readonly zelleInput: Locator;
  readonly savePaymentsButton: Locator;

  // Legal
  readonly policyCheckbox: Locator;
  readonly acceptPolicyButton: Locator;
  readonly policyAccepted: Locator;

  // Preferences
  readonly preferencesContainer: Locator;
  readonly defaultGroupSelect: Locator;
  readonly savePreferencesButton: Locator;

  // Security
  readonly newPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly changePasswordButton: Locator;

  // Group membership
  readonly groupMembershipLink: Locator;
  readonly leftGroupSelect: Locator;
  readonly rejoinGroupButton: Locator;
  readonly noLeftGroups: Locator;
  readonly confirmButton: Locator;

  constructor(page: Page) {
    super(page);
    this.navAccountLink = page.getByTestId('nav-account-desktop');
    this.logoutButton = page
      .getByTestId('logout-button-desktop')
      .filter({ visible: true });
    this.loginLink = page.getByTestId('nav-login-desktop');
    this.sidebar = page.getByTestId('account-sidebar');

    this.emailNotificationsToggle = page.getByTestId(
      'email-notifications-toggle'
    );
    this.emailInput = page.getByTestId('account-email-input');
    this.updateEmailButton = page.getByTestId('update-email-button');
    this.verifyEmailButton = page.getByTestId('verify-email-button');
    this.syncMemberEmails = page.getByTestId('sync-member-emails');
    this.syncMemberEmailsHelp = page.getByTestId('sync-member-emails-help');
    this.pendingEmailChange = page.getByTestId('pending-email-change');

    this.venmoInput = page.getByTestId('venmo-input');
    this.paypalInput = page.getByTestId('paypal-input');
    this.cashAppInput = page.getByTestId('cashapp-input');
    this.zelleInput = page.getByTestId('zelle-input');
    this.savePaymentsButton = page.getByTestId('save-payments-button');

    this.policyCheckbox = page
      .getByTestId('policy-checkbox')
      .getByRole('checkbox');
    this.acceptPolicyButton = page.getByTestId('accept-policy-button');
    this.policyAccepted = page.getByTestId('policy-accepted');

    this.preferencesContainer = page.getByTestId('preferences-container');
    this.defaultGroupSelect = page.getByTestId('default-group-select');
    this.savePreferencesButton = page.getByTestId('save-preferences-button');

    this.newPasswordInput = page.getByTestId('new-password-input');
    this.confirmPasswordInput = page.getByTestId('confirm-password-input');
    this.changePasswordButton = page.getByTestId('change-password-button');

    this.groupMembershipLink = page.getByTestId('nav-group-membership');
    this.leftGroupSelect = page.getByTestId('left-group-select');
    this.rejoinGroupButton = page.getByTestId('rejoin-group-button');
    this.noLeftGroups = page.getByTestId('group-membership-empty');
    this.confirmButton = page.getByTestId('confirm-button');
  }

  // ---- Navigation ---------------------------------------------------------

  /**
   * Opens Account from the header (no reload) and waits for its sidebar. On
   * a desktop-width window the account page redirects to its Profile section.
   */
  async gotoAccount(): Promise<void> {
    await this.navAccountLink.click();
    await expect(this.page).toHaveURL(/\/auth\/account\/profile$/);
    await expect(this.sidebar).toBeVisible();
    await this.waitForLoadingComplete();
  }

  /** Opens a section from the sidebar and waits for it to render. */
  async openSection(section: AccountSection): Promise<void> {
    await this.page.getByTestId(`nav-${section}`).click();
    await expect(this.page).toHaveURL(
      new RegExp(`/auth/account/${section}$`)
    );
    await expect(this.page.getByTestId(`${section}-container`)).toBeVisible();
    await this.waitForLoadingComplete();
  }

  /**
   * Opens Preferences, which has no sidebar link: by URL, once the account
   * page has rendered (so the app's post-load redirect has already passed).
   * The page then loads from scratch, so wait for the initial navigation.
   */
  async openPreferences(): Promise<void> {
    await this.page.goto('/auth/account/preferences');
    await this.waitForInitialNavigation();
    await expect(this.preferencesContainer).toBeVisible();
    await this.waitForLoadingComplete();
  }

  /**
   * Reloads the app (so what the section shows comes from Firestore, not
   * from the in-memory stores), then reopens `section` from the sidebar.
   * Waits for the reload's initial navigation to settle first, so no
   * redirect can override the click.
   */
  async reloadTo(section: AccountSection): Promise<void> {
    await this.page.reload();
    await this.waitForInitialNavigation();
    await this.waitForLoadingComplete();
    await this.openSection(section);
  }

  /** Signs out through the header and waits for the signed-out shell. */
  async signOut(): Promise<void> {
    await this.logoutButton.click();
    await expect(this.loginLink.filter({ visible: true })).toBeVisible();
    await expect(this.logoutButton).toBeHidden();
  }

  // ---- Profile email ------------------------------------------------------

  /**
   * Types a new address into the Profile email field (blurred) and presses
   * Update Email, which emails a confirm link to the new address (verify
   * before update; the account keeps its address until the link is used).
   * Returns without waiting for an outcome: the caller asserts the snackbar
   * the attempt shows.
   */
  async submitEmailChange(newEmail: string): Promise<void> {
    await this.fillAndCommit(this.emailInput, newEmail);
    await expect(this.updateEmailButton).toBeEnabled();
    await this.updateEmailButton.click();
  }

  // ---- Payments -----------------------------------------------------------

  /** Fills the four inputs (each blurred, as a user tabbing through does). */
  async fillPaymentIds(ids: PaymentIds): Promise<void> {
    const fields: [Locator, string][] = [
      [this.venmoInput, ids.venmo],
      [this.paypalInput, ids.paypal],
      [this.cashAppInput, ids.cashApp],
      [this.zelleInput, ids.zelle],
    ];
    for (const [input, value] of fields) {
      await this.fillAndCommit(input, value);
    }
  }

  async expectPaymentIds(ids: PaymentIds): Promise<void> {
    await expect(this.venmoInput).toHaveValue(ids.venmo);
    await expect(this.paypalInput).toHaveValue(ids.paypal);
    await expect(this.cashAppInput).toHaveValue(ids.cashApp);
    await expect(this.zelleInput).toHaveValue(ids.zelle);
  }

  /** Saves the payment IDs and waits for the success snackbar. */
  async savePaymentIds(): Promise<void> {
    await expect(this.savePaymentsButton).toBeEnabled();
    await this.savePaymentsButton.click();
    await expect(
      this.snackbarWith('Payment service IDs updated')
    ).toBeVisible();
    await this.waitForLoadingComplete();
  }

  // ---- Legal --------------------------------------------------------------

  /** Ticks the acknowledgement box and accepts the receipt policy. */
  async acceptReceiptPolicy(): Promise<void> {
    await expect(this.acceptPolicyButton).toBeDisabled();
    await this.policyCheckbox.click();
    await expect(this.policyCheckbox).toBeChecked();
    await expect(this.acceptPolicyButton).toBeEnabled();
    await this.acceptPolicyButton.click();
    await expect(
      this.snackbarWith('Receipt retention policy accepted')
    ).toBeVisible();
    await this.waitForLoadingComplete();
  }

  // ---- Preferences --------------------------------------------------------

  /** Picks the default group and saves it. */
  async saveDefaultGroup(groupName: string): Promise<void> {
    await this.chooseOption(this.defaultGroupSelect, groupName);
    await expect(this.savePreferencesButton).toBeEnabled();
    await this.savePreferencesButton.click();
    await expect(this.snackbarWith('Default group updated')).toBeVisible();
    await this.waitForLoadingComplete();
  }

  // ---- Security -----------------------------------------------------------

  /** Fills both password fields (blurred) and presses Change Password. */
  async changePassword(
    password: string,
    confirmation: string = password
  ): Promise<void> {
    await this.fillAndCommit(this.newPasswordInput, password);
    await this.fillAndCommit(this.confirmPasswordInput, confirmation);
    await expect(this.changePasswordButton).toBeEnabled();
    await this.changePasswordButton.click();
  }

  // ---- Group membership ---------------------------------------------------

  /** Rejoins a left group through the confirm dialog. */
  async rejoinGroup(groupName: string): Promise<void> {
    await this.chooseOption(this.leftGroupSelect, groupName);
    await expect(this.rejoinGroupButton).toBeEnabled();
    await this.rejoinGroupButton.click();
    await this.confirmButton.click();
    await expect(
      this.snackbarWith(`You have rejoined "${groupName}".`)
    ).toBeVisible();
    await this.waitForLoadingComplete();
  }
}
