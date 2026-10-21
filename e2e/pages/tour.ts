import { expect, Locator, Page } from '@playwright/test';

/** "N of M" as the tour card's footer shows it. */
export interface TourStepCount {
  step: number;
  total: number;
}

/**
 * The guided tour: the callout card, its spotlight layer and the keys the
 * tour listens for. Tours skip steps by role and data, so nothing here knows
 * a tour's length: read it from the card (stepCount) and walk to its end.
 */
export class TourCard {
  readonly title: Locator;
  readonly text: Locator;
  readonly count: Locator;
  readonly primaryButton: Locator;
  readonly backButton: Locator;
  readonly closeButton: Locator;
  /** "Read full help": shown on the last step only. */
  readonly fullHelpButton: Locator;
  /** The dimmed layer with the hole around the step's target. */
  readonly spotlight: Locator;

  constructor(readonly page: Page) {
    this.title = page.getByTestId('guided-tour-title');
    this.text = page.getByTestId('guided-tour-text');
    this.count = page.getByTestId('guided-tour-count');
    this.primaryButton = page.getByTestId('guided-tour-primary-button');
    this.backButton = page.getByTestId('guided-tour-back-button');
    this.closeButton = page.getByTestId('guided-tour-close-button');
    this.fullHelpButton = page.getByTestId('guided-tour-full-help-button');
    this.spotlight = page.getByTestId('guided-tour-spotlight');
  }

  /** Starts the tour from the page's help control and waits for step 1. */
  async start(helpButton: Locator): Promise<void> {
    await helpButton.click();
    await expect(this.title).toBeVisible();
  }

  /** Parses "N of M" from the card. */
  async stepCount(): Promise<TourStepCount> {
    const text = (await this.count.innerText()).trim();
    const match = /^(\d+) of (\d+)$/.exec(text);
    if (!match) {
      throw new Error(`Unexpected tour step count "${text}"`);
    }
    return { step: Number(match[1]), total: Number(match[2]) };
  }

  /** Waits for the card to read "<step> of <any total>". */
  async expectStep(step: number): Promise<void> {
    await expect(this.count).toHaveText(
      new RegExp(String.raw`^\s*${step} of \d+\s*$`)
    );
  }

  /** Next, or Done on the last step. */
  async next(): Promise<void> {
    await this.primaryButton.click();
  }

  async back(): Promise<void> {
    await this.backButton.click();
  }

  async close(): Promise<void> {
    await this.closeButton.click();
  }

  /**
   * Clicks the primary button until the count reads "M of M" and the button
   * says "Done", asserting every click moved the tour on (a later count and
   * a different title). A step whose target is missing is skipped, so the
   * count may jump by more than one, but it must advance. Returns M. Done is
   * not clicked: the caller ends the tour.
   */
  async walkToEnd(): Promise<number> {
    let { step, total } = await this.stepCount();
    while (step < total) {
      const previousTitle = (await this.title.innerText()).trim();
      const previousStep = step;
      await expect(this.primaryButton).toHaveText('Next');
      await this.next();
      // The card re-renders in place: wait for the step to change.
      await expect(this.count).not.toHaveText(`${previousStep} of ${total}`);
      await expect(this.title).not.toHaveText(previousTitle);
      ({ step, total } = await this.stepCount());
      expect(step).toBeGreaterThan(previousStep);
    }
    await expect(this.count).toHaveText(`${total} of ${total}`);
    await expect(this.primaryButton).toHaveText('Done');
    return total;
  }
}
