import { Injectable } from '@angular/core';

export interface HelpSection {
  id: string;
  title: string;
  content: string[];
}

@Injectable({
  providedIn: 'root',
})
export class HelpContentService {
  private helpSections: HelpSection[] = [
    {
      id: 'groups',
      title: 'Groups',
      content: [
        'In order to use this app, you must be a member of at least one group. If you received a group join code, click the Join Group button. Enter the group code, as well as your display name for the group. You can have a different display name for each group you are in.',
        'If you need to create a new group, click the Create New Group button. Enter the group name, as well as your display name for the group. After saving, the group join code will be generated and displayed. Share this code with people you want to invite to the group. You will automatically be made an admin for any group you create.',
        "You can manage all groups for which you are a group admin by clicking the Manage Groups button. From here, you can change the group name, or make it inactive. Inactive groups won't show up in the Select Group dropdown list on the groups page.",
      ],
    },
    {
      id: 'members',
      title: 'Members',
      content: [
        'Group members can click on their own name in the members list to update their display name and email address for the group. By default, when joining or creating a group, your email address is set to your login email address. However, this can be updated individually for each group without affecting your login email address.',
        'Group admins can add placeholder members by clicking the Add Member button. Enter the display name and email address for the new member. If someone registers for the app with the same email address and then joins the group, the placeholder member will be automatically replaced with the new member.',
        'Group admins can edit all group members, change their active status, and give or remove admin rights to other members. An admin may not remove their own admin rights - another admin must perform that update.',
        "Group members can only be removed if they don't have any expenses/splits assigned to them. Group members who are made inactive will no longer show up in the dropdown list when creating a new expense.",
      ],
    },
    {
      id: 'categories',
      title: 'Categories',
      content: [
        'A default category is automatically created when a new group is created. Any group admin can create additional categories.',
        "Categories can only be deleted if they don't have any expenses/splits assigned to them. Categories that are made inactive will no longer show up in the dropdown list when creating a new expense. Only group admins can edit or delete categories, or change their active status.",
        'If your group does not have any need for categorizing expenses, you can simply use the default category for all expenses. As long as your group only has one category, it will be selected automatically for you when you create a new expense.',
      ],
    },
    {
      id: 'expenses',
      title: 'Expenses',
      content: [
        'By default, the expenses page loads expenses from the last 90 days. You can change the start and end dates, then click the Fetch Expenses button to retrieve expenses for that date range. Be aware that clearing both dates and fetching all expenses for the group may take a while.',
        'You can filter the expenses by payer, description, or category using the search box. Clicking the Unpaid only toggle will alternate between showing all expenses or only those with unpaid splits.',
        'Clicking the Date header will toggle sorting the table in ascending or descending date order.',
        'Click the Splits arrow on any row to expand the split detail for that expense. You can click the paid icon on a split row to mark that specific split paid or unpaid. You can also click anywhere on the detail table to copy a text summary of the expense to your clipboard for easy sharing.',
        'Click the Add New Expense button to create a new expense for the group.',
        'Click on an expense row to edit the expense details. Please note that editing an expense will mark all splits unpaid. When viewing an existing expense, you can view the receipt, if one exists.',
      ],
    },
    {
      id: 'add-edit-expenses',
      title: 'Add & Edit Expenses',
      content: [
        'Enter or edit expense details with this form.',
        "With your cursor in the date field, you can use the + and - keys to adjust the date up and down by one day. Hitting 't' will set the date to today, 'm' or 'y' will set the date to the first day of the month or year of the date currently in the field, respectively.",
        'The Proportional Amount field is for items like tax and tip that should be split proportionally to the amount for which each member is responsible. The evenly shared remainder and the allocated split amount for each member will update automatically as you enter/update the total amount, proportional amount, and individual member amounts. The proportional amount is only available when splitting by amount, not percentage.',
        'Click the Add New Split button to add a single split line to the expense. By default, an expense is split evenly between all listed members. Click the Split by button to alternate between splitting the expense by dollar amount or by percentage.',
        'If you are splitting by amount, you can enter the amount in the Member Amount field that the member is individually responsible for and should not be split. Click the Add All Members button to automatically insert a split line for each active group member not already listed in the splits table. The form will automatically update the allocated amounts for each member as you change the total amount, proportional amount, or individual amounts for each member.',
        "If you are splitting by percentage, the form will automatically adjust the final member's percentage so that the total will always be 100%.",
        'You can perform basic arithmetic directly in any amount input field, but not percentage fields. (i.e. entering 3*6-2 in the total amount field will evaluate to 16.00) You can also use the calculator button to open a popup calculator to perform calculations. After entering calculations, clicking the = button will insert the result back into the amount field.',
        'The form also allows you to upload a supporting receipt for the expense. The receipt must be a PDF or an image file, with a maximum size of 5MB. Click the Upload receipt button, then select your file. The receipt will be saved with the expense. Please note that receipts are automatically deleted after 90 days if the expense is fully paid. If you need to keep a receipt for your records, please save a copy on your device.',
      ],
    },
    {
      id: 'memorized-expenses',
      title: 'Memorized Expenses',
      content: [
        'If your group has a regularly recurring expense, you can create a memorized expense on this page. Memorizing an expense saves most of the expense details, allowing you to quickly and easily create a new expense based on the memorized expense.',
        'After creating a memorized expense, it will appear in the table. Clicking a row in the table will let you edit or delete the memorized expense.',
        'You can filter the memorized expenses by payer, description, or category using the search box.',
        'Clicking the + on the memorized expense row will create a new expense based on the memorized expense.',
      ],
    },
    {
      id: 'add-edit-memorized',
      title: 'Add & Edit Memorized Expenses',
      content: [
        'Enter or edit a memorized expense with this form.',
        'The Proportional Amount field is for items like tax and tip that should be split proportionally to the amount for which each member is responsible. The evenly shared remainder and the allocated split amount for each member will update automatically as you enter/update the total amount, proportional amount, and individual member amounts. The proportional amount is only available when splitting by amount, not percentage.',
        'Click the Add New Split button to add a single split line to the expense. By default, an expense is split evenly between all listed members. Click the Split by button to alternate between splitting the expense by dollar amount or by percentage.',
        'If you are splitting by amount, you can enter the amount in the Member Amount field that the member is individually responsible for and should not be split. Click the Add All Members button to automatically insert a split line for each active group member not already listed in the splits table. The form will automatically update the allocated amounts for each member as you change the total amount, proportional amount, or individual amounts for each member.',
        "If you are splitting by percentage, the form will automatically adjust the final member's percentage so that the total will always be 100%.",
        'You can perform basic arithmetic directly in any amount input field, but not percentage fields. (i.e. entering 3*6-2 in the total amount field will evaluate to 16.00) You can also use the calculator button to open a popup calculator to perform calculations. After entering calculations, clicking the = button will insert the result back into the amount field.',
      ],
    },
    {
      id: 'summary',
      title: 'Summary',
      content: [
        'Select a group member from the dropdown list to view the total amount owed by that member to the other group members, and to that member from the other group members. If you wish to see a summary of expenses for a specific date range, you can enter the start date, end date, or both.',
        'After selecting a group member and optionally entering filter dates, if any outstanding expenses are found, you can click on a row in the table to see the category breakdown of the expenses owed between the two members.',
        'Click on a row to expand the category breakdown for that expense. You can click on the expanded detail to copy a summary of the expense with the breakdown to the clipboard for easy sharing.',
        "Click the paid icon on any row to pay all splits owed between those two group members. If you've added your various payment service handles on the account page, those services and your handles will appear in the payment dialog, so the payer knows how to send payment. Once payment is completed, click submit to mark the expenses as paid. Please note this action can only be undone by viewing the expenses on the expenses page and clicking the paid icon one split at a time. Marking expenses paid in this way will create a history record of the payment with the amount broken down by category. The history of payments can be viewed on the history page.",
      ],
    },
    {
      id: 'history',
      title: 'History',
      content: [
        'Select a group member from the dropdown list to view a history of payments made to and from that member.',
        'Click on any row to view a breakdown of the amounts by category for the payment. Clicking the detail breakdown will copy a summary of the payment to the clipboard for easy sharing.',
        'Group admins may delete history records. Payment history records are informational only -- deleting a payment history record does not mark the associated expenses as unpaid.',
      ],
    },
    {
      id: 'split',
      title: 'Split Expense',
      content: [
        'The Proportional Amount field is for items like tax and tip that should be split proportionally to the amount for which each member is responsible. The evenly shared remainder and the allocated split amount for each member will update automatically as you enter/update the total amount, proportional amount, and individual member amounts. The proportional amount is only available when splitting by amount, not percentage.',
        'Click the Add New Split button to add a single split line to the expense. By default, an expense is split evenly between all listed members. Click the Split by button to alternate between splitting the expense by dollar amount or by percentage.',
        'If you are splitting by amount, you can enter the amount in the Member Amount field that the member is individually responsible for and should not be split. The form will automatically update the allocated amounts for each member as you change the total amount, proportional amount, or individual amounts for each member.',
        "If you are splitting by percentage, the form will automatically adjust the final member's percentage so that the total will always be 100%.",
        'You can perform basic arithmetic directly in any amount input field, but not percentage fields. (i.e. entering 3*6-2 in the total amount field will evaluate to 16.00) You can also use the calculator button to open a popup calculator to perform calculations. After entering calculations, clicking the = button will insert the result back into the amount field.',
        'When all of the amounts are entered, click the Generate Summary button to create a summary of the split expense. On the summary, there is a copy button you can click to copy the summary to your clipboard so that it can be easily shared.',
      ],
    },
  ];

  getHelpSection(id: string): HelpSection | undefined {
    return this.helpSections.find((section) => section.id === id);
  }

  getAllHelpSections(): HelpSection[] {
    return this.helpSections;
  }
}
