import { inject, Injectable } from '@angular/core';
import { Category } from '@models/category';
import { Expense } from '@models/expense';
import { Group } from '@models/group';
import { History } from '@models/history';
import { Member } from '@models/member';
import { Memorized } from '@models/memorized';
import { Split } from '@models/split';
import { User } from '@models/user';
import { CategoryStore } from '@store/category.store';
import { ExpenseStore } from '@store/expense.store';
import { GroupStore } from '@store/group.store';
import { HistoryStore } from '@store/history.store';
import { MemberStore } from '@store/member.store';
import { MemorizedStore } from '@store/memorized.store';
import { SplitStore } from '@store/split.store';
import { UserStore } from '@store/user.store';

@Injectable({
  providedIn: 'root',
})
export class DemoModeService {
  protected readonly userStore = inject(UserStore);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly expenseStore = inject(ExpenseStore);
  protected readonly memorizedStore = inject(MemorizedStore);
  protected readonly historyStore = inject(HistoryStore);
  protected readonly splitStore = inject(SplitStore);

  // Helper to create mock DocumentReference with eq() method
  private createMockDocRef(id: string): any {
    return {
      id,
      eq: (other: any) => other?.id === id,
      path: `mock/${id}`,
    };
  }

  initializeDemoData(): void {
    // Create demo user
    const demoUser = new User({
      id: 'demo-user-123',
      email: 'demo@example.com',
      venmoId: 'demo-venmo',
      paypalId: 'demo@paypal.com',
      ref: this.createMockDocRef('demo-user-123'),
    });

    // Create demo categories
    const groceries = new Category({
      id: 'cat-1',
      name: 'Groceries',
      active: true,
      ref: this.createMockDocRef('cat-1'),
    });

    const restaurants = new Category({
      id: 'cat-2',
      name: 'Restaurants',
      active: true,
      ref: this.createMockDocRef('cat-2'),
    });

    const utilities = new Category({
      id: 'cat-3',
      name: 'Utilities',
      active: true,
      ref: this.createMockDocRef('cat-3'),
    });

    const entertainment = new Category({
      id: 'cat-4',
      name: 'Entertainment',
      active: true,
      ref: this.createMockDocRef('cat-4'),
    });

    // Create demo members
    const alice = new Member({
      id: 'member-1',
      displayName: 'Alice Johnson',
      email: 'alice@example.com',
      active: true,
      groupAdmin: true,
      userRef: this.createMockDocRef('demo-user-123'),
      ref: this.createMockDocRef('member-1'),
    });

    const bob = new Member({
      id: 'member-2',
      displayName: 'Bob Smith',
      email: 'bob@example.com',
      active: true,
      groupAdmin: false,
      userRef: this.createMockDocRef('demo-user-123'),
      ref: this.createMockDocRef('member-2'),
    });

    const charlie = new Member({
      id: 'member-3',
      displayName: 'Charlie Brown',
      email: 'charlie@example.com',
      active: true,
      groupAdmin: false,
      userRef: this.createMockDocRef('demo-user-123'),
      ref: this.createMockDocRef('member-3'),
    });

    // Create demo splits for expenses
    const createEvenSplits = (
      amount: number,
      members: Member[],
      paidBy: Member,
      date: Date,
      category: Category,
      expenseId: string
    ): Split[] => {
      const splitAmount = amount / members.length;
      return members.map(
        (member) =>
          new Split({
            id: `split-${expenseId}-${member.id}`,
            expenseRef: this.createMockDocRef(expenseId),
            date: date,
            categoryRef: this.createMockDocRef(category.id),
            category: category,
            assignedAmount: splitAmount,
            percentage: 100 / members.length,
            allocatedAmount: splitAmount,
            paidByMemberRef: paidBy.ref,
            paidByMember: paidBy,
            owedByMemberRef: member.ref,
            owedByMember: member,
            paid: Math.random() > 0.5, // Randomly mark some as paid for demo
            ref: this.createMockDocRef(`split-${expenseId}-${member.id}`),
          })
      );
    };

    // Create demo expenses (within last 30 days for default filtering)
    const exp1Date = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
    const expense1 = new Expense({
      id: 'exp-1',
      date: exp1Date,
      description: 'Weekly Grocery Shopping',
      categoryRef: this.createMockDocRef('cat-1'),
      category: groceries,
      paidByMemberRef: alice.ref,
      paidByMember: alice,
      sharedAmount: 127.45,
      allocatedAmount: 127.45,
      totalAmount: 127.45,
      splitByPercentage: false,
      splits: createEvenSplits(
        127.45,
        [alice, bob, charlie],
        alice,
        exp1Date,
        groceries,
        'exp-1'
      ),
      paid: false,
      ref: this.createMockDocRef('exp-1'),
    });

    const exp2Date = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    const expense2 = new Expense({
      id: 'exp-2',
      date: exp2Date,
      description: 'Pizza Night',
      categoryRef: this.createMockDocRef('cat-2'),
      category: restaurants,
      paidByMemberRef: bob.ref,
      paidByMember: bob,
      sharedAmount: 54.8,
      allocatedAmount: 54.8,
      totalAmount: 54.8,
      splitByPercentage: false,
      splits: createEvenSplits(
        54.8,
        [alice, bob, charlie],
        bob,
        exp2Date,
        restaurants,
        'exp-2'
      ),
      paid: false,
      ref: this.createMockDocRef('exp-2'),
    });

    const exp3Date = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000); // 15 days ago
    const expense3 = new Expense({
      id: 'exp-3',
      date: exp3Date,
      description: 'Electric Bill',
      categoryRef: this.createMockDocRef('cat-3'),
      category: utilities,
      paidByMemberRef: charlie.ref,
      paidByMember: charlie,
      sharedAmount: 89.32,
      allocatedAmount: 89.32,
      totalAmount: 89.32,
      splitByPercentage: false,
      splits: createEvenSplits(
        89.32,
        [alice, bob, charlie],
        charlie,
        exp3Date,
        utilities,
        'exp-3'
      ),
      paid: true,
      ref: this.createMockDocRef('exp-3'),
    });

    const exp4Date = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000); // 20 days ago
    const expense4 = new Expense({
      id: 'exp-4',
      date: exp4Date,
      description: 'Movie Theater',
      categoryRef: this.createMockDocRef('cat-4'),
      category: entertainment,
      paidByMemberRef: alice.ref,
      paidByMember: alice,
      sharedAmount: 36.0,
      allocatedAmount: 36.0,
      totalAmount: 36.0,
      splitByPercentage: false,
      splits: createEvenSplits(
        36.0,
        [alice, bob],
        alice,
        exp4Date,
        entertainment,
        'exp-4'
      ),
      paid: false,
      ref: this.createMockDocRef('exp-4'),
    });

    // Create demo memorized expenses
    const memorized1 = new Memorized({
      id: 'mem-1',
      description: 'Weekly Groceries Template',
      categoryRef: this.createMockDocRef('cat-1'),
      category: groceries,
      paidByMemberRef: alice.ref,
      paidByMember: alice,
      sharedAmount: 120.0,
      allocatedAmount: 120.0,
      totalAmount: 120.0,
      splitByPercentage: false,
      splits: [
        {
          assignedAmount: 40.0,
          percentage: 33.33,
          allocatedAmount: 40.0,
          owedByMember: alice,
        },
        {
          assignedAmount: 40.0,
          percentage: 33.33,
          allocatedAmount: 40.0,
          owedByMember: bob,
        },
        {
          assignedAmount: 40.0,
          percentage: 33.33,
          allocatedAmount: 40.0,
          owedByMember: charlie,
        },
      ],
      ref: this.createMockDocRef('mem-1'),
    });

    const memorized2 = new Memorized({
      id: 'mem-2',
      description: 'Monthly Utilities',
      categoryRef: this.createMockDocRef('cat-3'),
      category: utilities,
      paidByMemberRef: charlie.ref,
      paidByMember: charlie,
      sharedAmount: 150.0,
      allocatedAmount: 150.0,
      totalAmount: 150.0,
      splitByPercentage: false,
      splits: [
        {
          assignedAmount: 50.0,
          percentage: 33.33,
          allocatedAmount: 50.0,
          owedByMember: alice,
        },
        {
          assignedAmount: 50.0,
          percentage: 33.33,
          allocatedAmount: 50.0,
          owedByMember: bob,
        },
        {
          assignedAmount: 50.0,
          percentage: 33.33,
          allocatedAmount: 50.0,
          owedByMember: charlie,
        },
      ],
      ref: this.createMockDocRef('mem-2'),
    });

    // Create demo history records
    const history1 = new History({
      id: 'hist-1',
      date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000), // 25 days ago
      paidByMemberRef: bob.ref,
      paidByMember: bob,
      paidToMemberRef: alice.ref,
      paidToMember: alice,
      totalPaid: 45.5,
      lineItems: [
        { category: 'Groceries', amount: 30.0 },
        { category: 'Restaurants', amount: 15.5 },
      ],
      ref: this.createMockDocRef('hist-1'),
    });

    const history2 = new History({
      id: 'hist-2',
      date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000), // 12 days ago
      paidByMemberRef: charlie.ref,
      paidByMember: charlie,
      paidToMemberRef: alice.ref,
      paidToMember: alice,
      totalPaid: 22.75,
      lineItems: [
        { category: 'Entertainment', amount: 12.0 },
        { category: 'Utilities', amount: 10.75 },
      ],
      ref: this.createMockDocRef('hist-2'),
    });

    // Collect unpaid splits from all expenses
    const allUnpaidSplits = [expense1, expense2, expense4] // expense3 is marked as paid
      .flatMap((expense) => expense.splits.filter((split) => !split.paid));

    // Create demo group
    const demoGroup = new Group({
      id: 'demo-group-123',
      name: 'Demo Household',
      active: true,
      members: [alice, bob, charlie],
      expenses: [expense1, expense2, expense3, expense4],
      categories: [groceries, restaurants, utilities, entertainment],
      autoAddMembers: false,
      ref: this.createMockDocRef('demo-group-123'),
    });

    // Initialize stores with demo data
    this.userStore.setUser(demoUser);
    this.userStore.setIsDemoMode(true);
    this.groupStore.setAllUserGroups([demoGroup]);
    this.groupStore.setCurrentGroup(demoGroup);
    this.groupStore.setAdminGroupIds([demoGroup.id]);
    this.memberStore.setGroupMembers([alice, bob, charlie]);
    this.memberStore.setCurrentMember(alice); // Set Alice as the current member for demo
    this.categoryStore.setGroupCategories([
      groceries,
      restaurants,
      utilities,
      entertainment,
    ]);
    this.expenseStore.setGroupExpenses([
      expense1,
      expense2,
      expense3,
      expense4,
    ]);
    this.memorizedStore.setMemorizedExpenses([memorized1, memorized2]);
    this.historyStore.setHistory([history1, history2]);
    this.splitStore.setSplits(allUnpaidSplits);

    // Set localStorage to simulate being logged in (store as JSON like the real app)
    localStorage.setItem(
      'currentGroup',
      JSON.stringify({
        id: demoGroup.id,
        name: demoGroup.name,
        active: demoGroup.active,
        autoAddMembers: demoGroup.autoAddMembers,
      })
    );

    console.log('Demo mode initialized with sample data');
  }
}
