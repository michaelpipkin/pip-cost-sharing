import { GuidedTourStep } from '@models/guided-tour';

/** What the Vacation Rental tour needs from the page to demonstrate each step. */
export interface RentalTourHooks {
  /** Fills in a sample stay where the wizard is still at its defaults. */
  loadSample(): void;
  /** Turns room rates on (with sample rooms if there are none) or off. */
  showRooms(on: boolean): void;
}

export function buildRentalTourSteps(hooks: RentalTourHooks): GuidedTourStep[] {
  // Steps that depend on the rooms toggle set it themselves, so Back always
  // shows the page in the state its text describes
  const noRooms = () => hooks.showRooms(false);

  return [
    {
      id: 'intro',
      title: 'Vacation rental',
      text: "This wizard splits a rental (like a VRBO or Airbnb) fairly when not everyone stayed every night. We'll fill in a sample stay so you can see how it works. Anything you've already entered comes back when the tour ends.",
      beforeShow: () => {
        hooks.loadSample();
        noRooms();
      },
    },
    {
      id: 'basics',
      title: 'The rental',
      text: 'Enter the total cost of the rental, the number of nights, and a description for the expense.',
      target: 'rental-basics',
      beforeShow: noRooms,
    },
    {
      id: 'people',
      title: 'Who came',
      text: "Every active group member starts in the grid. Remove anyone who didn't come with their delete button; Add Member above the grid adds them back.",
      target: ['rental-add-members', 'rental-occupancy'],
      beforeShow: noRooms,
    },
    {
      id: 'nights',
      title: 'Who stayed which nights',
      text: "Uncheck a night for anyone who didn't stay that night; the checkbox at the top of a column sets everyone for that night. Each night's cost is split evenly among whoever stayed, so nights with fewer people cost each of them more. Every night needs at least one person.",
      target: 'rental-occupancy',
      beforeShow: noRooms,
    },
    {
      id: 'rooms',
      title: 'Rooms with different rates',
      text: "If the rooms aren't equal, like a master suite versus a bunk room, turn this on. Give each room a rate compared to a standard room (1.0) and choose who stayed in it. Anyone without a room pays the standard rate.",
      target: ['rental-rooms-toggle', 'rental-rooms'],
      beforeShow: () => hooks.showRooms(true),
    },
    {
      id: 'rooms-grid',
      title: 'Rates in the grid',
      text: "Each night, a room's rate is split among the people in it that night, so two people sharing a room each pay less than someone with a room to themselves. The Shares and Amount columns update to match.",
      target: 'rental-occupancy',
      beforeShow: () => hooks.showRooms(true),
    },
    {
      id: 'continue',
      title: 'Continue to the expense',
      text: "Continue opens Add Expense with this split filled in as shares. Choose the payer, category, and date there, then save. To change the stay later, open the expense and click Edit Occupancy Grid. That's the tour!",
      target: 'rental-actions',
      placement: 'top',
      beforeShow: noRooms,
    },
  ];
}
