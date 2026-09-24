import { GuidedTourStep } from '@models/guided-tour';
import { SplitMethod } from '@utils/split-method';

/** What the Split Expense tour needs from the page to demonstrate each step. */
export interface SplitTourHooks {
  /** Fills in a sample bill where the form is still empty. */
  loadSample(): void;
  /** Shows the form (not the summary or the rental grid) in this method. */
  showForm(method: SplitMethod): void;
  /** Opens the vacation rental grid with a sample stay. */
  showRental(): void;
  /** Generates the summary. */
  showSummary(): void;
}

export function buildSplitTourSteps(hooks: SplitTourHooks): GuidedTourStep[] {
  // Steps that depend on the page state set it themselves, so Back always
  // shows the page in the state its text describes
  const amountMode = () => hooks.showForm('amount');

  return [
    {
      id: 'intro',
      title: 'Split an expense',
      text: "Split any bill with anyone, no group needed. Nothing here is saved; it's a calculator that gives you a summary to share. We'll fill in a sample so you can see how it works. Anything you've already entered comes back when the tour ends.",
      beforeShow: () => {
        hooks.loadSample();
        amountMode();
      },
    },
    {
      id: 'currency',
      title: 'Currency',
      text: 'Choose the currency for this bill. Changing it clears the form.',
      target: 'split-currency',
      beforeShow: amountMode,
    },
    {
      id: 'total',
      title: 'Total amount',
      text: 'Enter the grand total exactly as charged, including tax and tip. You can type math like 3*6-2, or use the calculator button and press = to put the result back in the field.',
      target: 'split-total',
      beforeShow: amountMode,
    },
    {
      id: 'proportional',
      title: 'Tax, tip, and other proportional costs',
      text: "Enter the part of the total, like tax and tip, that should be split in proportion to what each person ordered. It's included in the total above, not added on top. This field is available when splitting by amount.",
      target: 'split-proportional',
      beforeShow: amountMode,
    },
    {
      id: 'remainder',
      title: 'Evenly shared remainder',
      text: "Whatever isn't assigned to someone personally, like a shared appetizer, is split evenly. This updates automatically as you change the amounts.",
      target: 'split-remainder',
      beforeShow: amountMode,
    },
    {
      id: 'add-split',
      title: 'Add people',
      text: "Add New Split adds a line for one person. Type any name; they don't need to be in a group.",
      target: 'split-add',
      beforeShow: amountMode,
    },
    {
      id: 'splits-amount',
      title: 'Who owes what',
      text: 'Enter what each person is personally responsible for in Member Amount. Their Allocated Amount (personal, plus their share of the remainder and of the tax and tip) updates automatically. The trash button removes a line.',
      target: 'split-lines',
      beforeShow: amountMode,
    },
    {
      id: 'split-method',
      title: 'Choose how to split',
      text: 'Split by exact amounts, by percentage, or by shares. The next two steps show % and Shares.',
      target: 'split-method',
      beforeShow: amountMode,
    },
    {
      id: 'splits-percentage',
      title: 'Split by percentage',
      text: "Enter each person's percentage. The last person's percentage is filled in automatically so the total is always 100%.",
      target: 'split-lines',
      beforeShow: () => hooks.showForm('percentage'),
    },
    {
      id: 'splits-shares',
      title: 'Split by shares',
      text: "Enter a share for each person to split by ratio, like 2:1, without working out percentages. Shares don't have to be whole numbers (1.5 works), and each person's effective percentage shows next to their shares.",
      target: 'split-lines',
      beforeShow: () => hooks.showForm('shares'),
    },
    {
      id: 'rental-button',
      title: 'Vacation rental',
      text: 'Sharing a rental where not everyone stayed every night? Vacation Rental opens an occupancy grid.',
      target: 'split-rental-button',
      beforeShow: amountMode,
    },
    {
      id: 'rental-grid',
      title: 'Who stayed which nights',
      text: "Enter the number of nights, add each person, and check off the nights they stayed. Each night's cost is divided among whoever stayed, so nights with fewer people cost each of them more. Apply Shares turns the grid into a shares split you can still adjust.",
      target: ['split-rental', 'split-rental-actions'],
      placement: 'top',
      beforeShow: () => hooks.showRental(),
    },
    {
      id: 'generate',
      title: 'Generate the summary',
      text: 'Generate Summary enables once the whole total is allocated.',
      target: 'split-generate',
      placement: 'top',
      beforeShow: amountMode,
    },
    {
      id: 'summary',
      title: 'Share the summary',
      text: "The summary shows what each person owes, with the breakdown. The copy button copies it to paste into a message. Edit Split goes back to the form, and Start Over clears it. That's the tour!",
      // The header (with the copy button), not the whole summary, which can
      // be taller than a phone screen and leave the card nowhere to go
      target: 'split-summary',
      placement: 'right',
      beforeShow: () => hooks.showSummary(),
    },
  ];
}
