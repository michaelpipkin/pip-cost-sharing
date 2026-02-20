import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DemoService } from './demo.service';

// Import Shepherd types
import type { Tour, TourOptions } from 'shepherd.js';

/**
 * Tour step configuration
 */
export interface TourStep {
  id: string;
  attachTo?: {
    element: string;
    on: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  };
  title: string;
  text: string;
  buttons: Array<{
    text: string;
    action: () => void;
    classes?: string;
  }>;
  beforeShowPromise?: () => Promise<void>;
}

/**
 * Tour configuration
 */
export interface TourConfig {
  id: string;
  steps: TourStep[];
}

/**
 * Service to manage Shepherd.js guided tours for demo mode
 * Provides interactive walkthroughs of key features
 */
@Injectable({
  providedIn: 'root',
})
export class TourService {
  protected readonly demoService = inject(DemoService);
  protected readonly router = inject(Router);

  // Current active tour instance
  private currentTour: Tour | null = null;

  // Signal to track if a tour is currently active
  isTourActive = signal<boolean>(false);

  // LocalStorage key prefix for tour completion state
  private readonly TOUR_STORAGE_PREFIX = 'pipsplit_tour_completed_';

  // Default Shepherd.js options
  private readonly defaultTourOptions: TourOptions = {
    useModalOverlay: true,
    defaultStepOptions: {
      cancelIcon: {
        enabled: true,
      },
      scrollTo: { behavior: 'smooth', block: 'center' },
      modalOverlayOpeningPadding: 4,
      modalOverlayOpeningRadius: 4,
    },
  };

  constructor() {
    // Initialize Shepherd default classes for Angular Material styling
    this.setupDefaultClasses();
  }

  /**
   * Configure default button classes to match Angular Material design
   */
  private setupDefaultClasses(): void {
    // These will be applied to tour elements
    // Custom CSS will be added in styles to match Material theme
  }

  /**
   * Check if a specific tour has been completed
   */
  isTourCompleted(tourId: string): boolean {
    const completed = localStorage.getItem(
      `${this.TOUR_STORAGE_PREFIX}${tourId}`
    );
    return completed === 'true';
  }

  /**
   * Mark a tour as completed in localStorage
   */
  markTourCompleted(tourId: string): void {
    localStorage.setItem(`${this.TOUR_STORAGE_PREFIX}${tourId}`, 'true');
  }

  /**
   * Reset all tour completion states
   */
  resetAllTours(): void {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(this.TOUR_STORAGE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  }

  /**
   * Start a tour if not already completed and in demo mode
   */
  private async startTour(
    config: TourConfig,
    force: boolean = false
  ): Promise<void> {
    // Only show tours in demo mode
    if (!this.demoService.isInDemoMode()) {
      return;
    }

    // Don't show if already completed (unless forced)
    if (!force && this.isTourCompleted(config.id)) {
      return;
    }

    // Cancel any existing tour
    if (this.currentTour) {
      this.currentTour.complete();
    }

    // Dynamically import Shepherd to avoid issues
    const Shepherd = (await import('shepherd.js')).default;

    // Create new tour instance
    this.currentTour = new Shepherd.Tour(this.defaultTourOptions);

    // Add steps to tour
    config.steps.forEach((stepConfig) => {
      this.currentTour!.addStep({
        id: stepConfig.id,
        attachTo: stepConfig.attachTo,
        title: stepConfig.title,
        text: stepConfig.text,
        buttons: stepConfig.buttons,
        beforeShowPromise: stepConfig.beforeShowPromise,
      });
    });

    // Set up tour event handlers
    this.currentTour.on('complete', () => {
      this.markTourCompleted(config.id);
      this.isTourActive.set(false);
      this.currentTour = null;
    });

    this.currentTour.on('cancel', () => {
      this.isTourActive.set(false);
      this.currentTour = null;
    });

    // Start the tour
    this.isTourActive.set(true);
    this.currentTour.start();
  }

  /**
   * Stop the current tour if one is active
   */
  stopCurrentTour(): void {
    if (this.currentTour) {
      this.currentTour.complete();
      this.currentTour = null;
      this.isTourActive.set(false);
    }
  }

  /**
   * Get common button configurations
   */
  private getBackButton(): TourStep['buttons'][0] {
    return {
      text: 'Back',
      action: function (this: Tour) {
        this.back();
      },
      classes: 'shepherd-button-secondary',
    };
  }

  private getNextButton(text: string = 'Next'): TourStep['buttons'][0] {
    return {
      text,
      action: function (this: Tour) {
        this.next();
      },
      classes: 'shepherd-button-primary',
    };
  }

  private getSkipButton(): TourStep['buttons'][0] {
    return {
      text: 'Skip Tour',
      action: function (this: Tour) {
        this.cancel();
      },
      classes: 'shepherd-button-secondary',
    };
  }

  private getFinishButton(): TourStep['buttons'][0] {
    return {
      text: 'Finish',
      action: function (this: Tour) {
        this.complete();
      },
      classes: 'shepherd-button-primary',
    };
  }

  /**
   * Start the Welcome Tour (auto-starts on first demo visit)
   */
  startWelcomeTour(force: boolean = false): void {
    const tourConfig: TourConfig = {
      id: 'splits',
      steps: [
        {
          id: 'welcome-intro',
          title: 'Welcome to PipSplit Demo!',
          text: "This is a fully interactive demo with sample data. Let's take a quick tour to show you PipSplit's unique splitting capabilities!",
          buttons: [this.getNextButton(), this.getSkipButton()],
        },
        {
          id: 'splits-overview',
          title: 'Split Expense Calculator',
          text: "This is the Split page where you can quickly split a single expense without needing an account. It's perfect for one-time expenses or when you don't want to create a full group.",
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'total-amount',
          attachTo: {
            element: '.total-amount-field',
            on: 'bottom',
          },
          title: 'Total Amount',
          text: "Enter the total expense amount here. We've pre-filled $65.33 for a demo dinner out between these friends. You can click or tap the calculator icon to use the built-in calculator if needed. The result from the calculator will automatically populate this field after you hit the '=' button.",
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'proportional-amount',
          attachTo: {
            element: '.proportional-amount-field',
            on: 'bottom',
          },
          title: "PipSplit's Unique Feature",
          text: "This is what sets PipSplit apart! Add amounts like tax or tip that should be split proportionally based on each person's share. We've entered $17.44 for this example.",
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'member-amounts',
          attachTo: {
            element: '#split-member',
            on: 'bottom',
          },
          title: 'Individual Amounts',
          text: 'Unlike other apps which only allow equal splits or percentages, PipSplit lets you assign specific amounts to each person. In this example, Alice ordered $12.55, Bob $13.37, and Charlie $14.02 worth of food.',
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'shared-remainder',
          title: 'Smart Calculations',
          text: "PipSplit automatically calculates the evenly shared remainder ($7.95 for a shared appetizer in this case) and splits the proportional amount based on each person's individual spending. This ensures fair splitting when people order different amounts!",
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'try-summary',
          attachTo: {
            element: '[data-tour="generate-summary-button"]',
            on: 'top',
          },
          title: 'Generate the Summary',
          text: "Click 'Generate Summary' to see exactly how the expense is split, including the breakdown of personal, shared, and proportional amounts for each person. Go ahead and click it now!",
          buttons: [
            this.getBackButton(),
            this.getNextButton('Continue'),
            this.getSkipButton(),
          ],
        },
        {
          id: 'copy-summary',
          attachTo: {
            element: '[data-tour="copy-summary-button"]',
            on: 'bottom',
          },
          title: 'Easy Sharing',
          text: 'Click this button to copy the summary to your clipboard. You can then paste it into a text message or email to share with your group members!',
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
          beforeShowPromise: () => {
            return new Promise<void>((resolve) => {
              // Wait for the copy button to be available (when summary is shown)
              const checkElement = () => {
                const element = document.querySelector(
                  '[data-tour="copy-summary-button"]'
                );
                if (element) {
                  resolve();
                } else {
                  // If element not found, wait a bit and check again (max 5 seconds)
                  setTimeout(checkElement, 100);
                }
              };
              checkElement();
            });
          },
        },
        {
          id: 'explore-more',
          title: 'Want to See More?',
          text: 'This is just a taste of PipSplit! Create a free account to manage groups, track expenses over time, and see who owes what. Or continue exploring the demo features!',
          buttons: [
            this.getBackButton(),
            {
              text: 'Explore Demo',
              action: () => {
                this.currentTour?.complete();
                this.router.navigate(['/demo/administration/groups'], {
                  queryParams: { continueTour: 'true' },
                });
              },
              classes: 'shepherd-button-primary',
            },
            this.getFinishButton(),
          ],
        },
      ],
    };

    this.startTour(tourConfig, force);
  }

  /**
   * Start the Groups Tour
   */
  startGroupsTour(force: boolean = false): void {
    const tourConfig: TourConfig = {
      id: 'groups',
      steps: [
        {
          id: 'groups-intro',
          title: 'Groups Overview',
          text: "This is the Groups page where you can create and manage groups to start sharing expenses with others. Let's take a quick tour to show you around!",
          buttons: [this.getNextButton(), this.getSkipButton()],
        },
        {
          id: 'welcome-group',
          attachTo: {
            element: '[data-tour="groups-table"]',
            on: 'bottom',
          },
          title: 'Your Demo Group',
          text: "We've set up a sample group with three members: Alice, Bob, and Charlie. This group has shared expenses you can explore.",
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'welcome-navigation',
          attachTo: {
            // Use desktop nav if present, fallback to mobile hamburger menu
            element:
              '[data-tour="desktop-navigation"], [data-tour="mobile-navigation"]',
            on: 'bottom',
          },
          title: 'Navigate the App',
          text: 'Use this menu to explore different sections: Members, Categories, Expenses, and more!',
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'welcome-restrictions',
          attachTo: {
            element: '[data-tour="add-button"]',
            on: 'bottom',
          },
          title: 'Demo Mode Restrictions',
          text: 'You can view all data, but creating or editing is disabled in demo mode. Create a free account to use all features!',
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'welcome-next-steps',
          title: 'Explore Members',
          text: "Let's look at the members page next!",
          buttons: [
            this.getBackButton(),
            {
              text: 'Go to Members',
              action: () => {
                this.currentTour?.complete();
                this.router.navigate(['/demo/administration/members'], {
                  queryParams: { continueTour: 'true' },
                });
              },
              classes: 'shepherd-button-primary',
            },
            this.getSkipButton(),
          ],
        },
      ],
    };

    this.startTour(tourConfig, force);
  }

  /**
   * Start the Members Tour
   */
  startMembersTour(force: boolean = false): void {
    const tourConfig: TourConfig = {
      id: 'members',
      steps: [
        {
          id: 'members-intro',
          attachTo: {
            element: '[data-tour="members-table"]',
            on: 'bottom',
          },
          title: 'Group Members',
          text: 'Here are all the members in your group. Members can track shared expenses and see who owes what.',
          buttons: [this.getNextButton(), this.getSkipButton()],
        },
        {
          id: 'members-search',
          attachTo: {
            element: '[data-tour="member-search"]',
            on: 'bottom',
          },
          title: 'Search Members',
          text: 'Quickly find members by searching for their name or email address.',
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'members-filter',
          attachTo: {
            element: '[data-tour="member-filter"]',
            on: 'bottom',
          },
          title: 'Filter Members',
          text: "Toggle to show only active members or include inactive ones. Inactive members can still see past expenses but won't appear in dropdowns when creating new expenses.",
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'members-add',
          attachTo: {
            element: '[data-tour="add-member-button"]',
            on: 'bottom',
          },
          title: 'Adding Members',
          text: 'Group admins can add new members to share expenses.',
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'members-next-steps',
          title: 'Explore Categories',
          text: "Next, let's see how categories help organize your expenses!",
          buttons: [
            this.getBackButton(),
            {
              text: 'Go to Categories',
              action: () => {
                this.currentTour?.complete();
                this.router.navigate(['/demo/administration/categories'], {
                  queryParams: { continueTour: 'true' },
                });
              },
              classes: 'shepherd-button-primary',
            },
            this.getSkipButton(),
          ],
        },
      ],
    };

    this.startTour(tourConfig, force);
  }

  /**
   * Start the Categories Tour
   */
  startCategoriesTour(force: boolean = false): void {
    const tourConfig: TourConfig = {
      id: 'categories',
      steps: [
        {
          id: 'categories-intro',
          attachTo: {
            element: '[data-tour="categories-table"]',
            on: 'bottom',
          },
          title: 'Expense Categories',
          text: 'Categories help you organize and track your expenses. Each expense can be assigned to a category for better reporting.',
          buttons: [this.getNextButton(), this.getSkipButton()],
        },
        {
          id: 'categories-add',
          attachTo: {
            element: '[data-tour="add-category-button"]',
            on: 'bottom',
          },
          title: 'Adding Categories',
          text: "You can add custom categories here to match your expense tracking needs. If you don't need to track categories for your group, you can just use the default category that is added when you create a new group. When you add a new expense, the default category will be automatically assigned.",
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'categories-next-steps',
          title: 'Explore Expenses',
          text: "Now let's look at expenses to see how categories are used!",
          buttons: [
            this.getBackButton(),
            {
              text: 'Go to Expenses',
              action: () => {
                this.currentTour?.complete();
                this.router.navigate(['/demo/expenses'], {
                  queryParams: { continueTour: 'true' },
                });
              },
              classes: 'shepherd-button-primary',
            },
            this.getSkipButton(),
          ],
        },
      ],
    };

    this.startTour(tourConfig, force);
  }

  /**
   * Start the Expenses Tour
   */
  startExpensesTour(force: boolean = false): void {
    const tourConfig: TourConfig = {
      id: 'expenses',
      steps: [
        {
          id: 'expenses-intro',
          attachTo: {
            element: '[data-tour="expenses-list"]',
            on: 'top',
          },
          title: 'Your Shared Expenses',
          text: 'Here are all expenses shared within your group. You can see who paid, the amount, and how it was split.',
          buttons: [this.getNextButton(), this.getSkipButton()],
        },
        {
          id: 'expenses-details',
          attachTo: {
            element: '[data-tour="expense-row"]',
            on: 'left',
          },
          title: 'View Expense Details',
          text: 'Click the splits expansion any expense to see the full breakdown: who paid, who owes, and how the split was calculated. Click anywhere else on a split row to edit the expense.',
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'expenses-split-types',
          title: 'Different Split Types',
          text: 'PipSplit supports equal splits, custom amounts, percentages, and shares. Each expense can use the best method for your situation.',
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'expenses-add-expense',
          attachTo: {
            element: '[data-tour="add-expense-button"]',
            on: 'bottom',
          },
          title: 'Adding Expenses',
          text: 'Click here to add a new expense. Even in demo mode, you can explore the full add expense interface!',
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'expenses-next-steps',
          title: 'Try Adding an Expense',
          text: "Let's explore how to add an expense with splits!",
          buttons: [
            this.getBackButton(),
            {
              text: 'Go to Add Expense',
              action: () => {
                this.currentTour?.complete();
                this.router.navigate(['/demo/expenses/add'], {
                  queryParams: { continueTour: 'true' },
                });
              },
              classes: 'shepherd-button-primary',
            },
            this.getSkipButton(),
          ],
        },
      ],
    };

    this.startTour(tourConfig, force);
  }

  /**
   * Start the Add Expense Tour
   */
  startAddExpenseTour(force: boolean = false): void {
    const tourConfig: TourConfig = {
      id: 'add-expense',
      steps: [
        {
          id: 'add-expense-intro',
          title: 'Add New Expense',
          text: 'This page lets you record shared expenses with detailed splits. Even in demo mode, you can explore all the features!',
          buttons: [this.getNextButton(), this.getSkipButton()],
        },
        {
          id: 'add-expense-basic',
          attachTo: {
            element: '[data-tour="basic-info"]',
            on: 'bottom',
          },
          title: 'Basic Information',
          text: 'Enter who paid, the date, description, and category for your expense.',
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'add-expense-amounts',
          attachTo: {
            element: '[data-tour="amount-fields"]',
            on: 'bottom',
          },
          title: 'Expense Amounts',
          text: 'Enter the total amount. You can also add proportional amounts like tax or tip that get split evenly.',
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'add-expense-splits',
          attachTo: {
            element: '[data-tour="split-controls"]',
            on: 'top',
          },
          title: 'Split the Expense',
          text: 'Add splits for each person. You can split by amount or percentage, and allocate custom amounts per person.',
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'add-expense-next',
          title: 'Explore Memorized Expenses',
          text: "Want to save time? Let's look at memorized expenses for recurring items!",
          buttons: [
            this.getBackButton(),
            {
              text: 'Go to Memorized',
              action: () => {
                this.currentTour?.complete();
                this.router.navigate(['/demo/memorized'], {
                  queryParams: { continueTour: 'true' },
                });
              },
              classes: 'shepherd-button-primary',
            },
            this.getSkipButton(),
          ],
        },
      ],
    };

    this.startTour(tourConfig, force);
  }

  /**
   * Start the Memorized Expenses Tour
   */
  startMemorizedTour(force: boolean = false): void {
    const tourConfig: TourConfig = {
      id: 'memorized',
      steps: [
        {
          id: 'memorized-intro',
          title: 'Memorized Expenses',
          text: 'Save recurring expenses (rent, utilities, subscriptions) as templates for quick entry.',
          buttons: [this.getNextButton(), this.getSkipButton()],
        },
        {
          id: 'memorized-quick-entry',
          attachTo: {
            element: '[data-tour="memorized-table"]',
            on: 'left',
          },
          title: 'Reuse Templates',
          text: 'Click the + button on a memorized expense to quickly add it with pre-filled details. Perfect for monthly bills!',
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'memorized-next-steps',
          title: 'See Who Owes What',
          text: "Next, let's see the payment summary to understand who owes whom!",
          buttons: [
            this.getBackButton(),
            {
              text: 'Go to Summary',
              action: () => {
                this.currentTour?.complete();
                this.router.navigate(['/demo/analysis/summary'], {
                  queryParams: { continueTour: 'true' },
                });
              },
              classes: 'shepherd-button-primary',
            },
            this.getSkipButton(),
          ],
        },
      ],
    };

    this.startTour(tourConfig, force);
  }

  /**
   * Start the Summary Tour
   */
  startSummaryTour(force: boolean = false): void {
    const tourConfig: TourConfig = {
      id: 'summary',
      steps: [
        {
          id: 'summary-intro',
          title: 'Payment Summary',
          text: 'The Summary page has two sections: a member-to-member view for individual payments, and a Least Transfers Settlement section that calculates the minimum number of transactions needed to zero out all debts.',
          buttons: [this.getNextButton(), this.getSkipButton()],
        },
        {
          id: 'summary-flow',
          attachTo: {
            element: '[data-tour="payment-flow"]',
            on: 'top',
          },
          title: 'Member-to-Member View',
          text: 'Select a group member from the dropdown to see who owes them and who they owe. Click any row to expand the category breakdown. Use the pay button to record a payment and mark those splits as paid — history records include a full category breakdown.',
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'summary-least-transfers',
          attachTo: {
            element: '[data-tour="least-transfers-table"]',
            on: 'top',
          },
          title: 'Least Transfers Settlement',
          text: 'This table shows the minimum number of payments needed to settle all debts across the whole group. Our algorithm calculates net balances and finds the most efficient path — for example, if Alice owes Bob and Bob owes Carol, Alice might pay Carol directly instead.',
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'summary-settle-group',
          attachTo: {
            element: '[data-tour="settle-group-button"]',
            on: 'top',
          },
          title: 'Settle Group',
          text: "Once all members have completed their transfers, click Settle Group to mark all outstanding expenses as paid in one action. A confirmation dialog lists the expected transfers first. History records are created for each transfer. Let's check out the payment history next!",
          buttons: [
            this.getBackButton(),
            {
              text: 'Go to History',
              action: () => {
                this.currentTour?.complete();
                this.router.navigate(['/demo/analysis/history'], {
                  queryParams: { continueTour: 'true' },
                });
              },
              classes: 'shepherd-button-primary',
            },
            this.getSkipButton(),
          ],
        },
      ],
    };

    this.startTour(tourConfig, force);
  }

  /**
   * Start the History Tour
   */
  startHistoryTour(force: boolean = false): void {
    const tourConfig: TourConfig = {
      id: 'history',
      steps: [
        {
          id: 'history-intro',
          title: 'Payment History',
          text: 'Track past settlements and see who paid whom over time.',
          buttons: [this.getNextButton(), this.getSkipButton()],
        },
        {
          id: 'history-records',
          attachTo: {
            element: '[data-tour="history-table"]',
            on: 'top',
          },
          title: 'Historical Payments',
          text: 'All recorded settlements appear here with dates, amounts, and involved members. The Type column shows whether it was a direct member payment (person icon) or a group settle payment (group icon). Click on a member payment row to navigate to a detailed breakdown of that payment.',
          buttons: [
            this.getBackButton(),
            this.getNextButton(),
            this.getSkipButton(),
          ],
        },
        {
          id: 'history-complete',
          title: 'Welcome to PipSplit!',
          text: 'That concludes the demo tour! Feel free to explore the demo and create a free account to manage your own groups and expenses.',
          buttons: [this.getBackButton(), this.getFinishButton()],
        },
      ],
    };

    this.startTour(tourConfig, force);
  }

  /**
   * Check if tour should auto-start based on query params
   */
  checkForContinueTour(
    tourName:
      | 'groups'
      | 'members'
      | 'categories'
      | 'expenses'
      | 'add-expense'
      | 'memorized'
      | 'summary'
      | 'history'
  ): void {
    const queryParams = this.router.parseUrl(this.router.url).queryParams;
    if (queryParams['continueTour'] === 'true') {
      // Remove query param
      this.router.navigate([], {
        queryParams: { continueTour: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });

      // Start the appropriate tour after a short delay to ensure DOM is ready
      setTimeout(() => {
        if (tourName === 'groups') {
          this.startGroupsTour(true);
        } else if (tourName === 'members') {
          this.startMembersTour(true);
        } else if (tourName === 'categories') {
          this.startCategoriesTour(true);
        } else if (tourName === 'expenses') {
          this.startExpensesTour(true);
        } else if (tourName === 'add-expense') {
          this.startAddExpenseTour(true);
        } else if (tourName === 'memorized') {
          this.startMemorizedTour(true);
        } else if (tourName === 'summary') {
          this.startSummaryTour(true);
        } else if (tourName === 'history') {
          this.startHistoryTour(true);
        }
      }, 300);
    }
  }
}
