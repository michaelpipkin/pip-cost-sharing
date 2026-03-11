import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { ROUTE_PATHS } from '@constants/routes.constants';
import { Member } from '@models/member';
import { User } from '@models/user';
import { AnalyticsService } from '@services/analytics.service';
import { CategoryStore } from '@store/category.store';
import { ExpenseStore } from '@store/expense.store';
import { GroupStore } from '@store/group.store';
import { HistoryStore } from '@store/history.store';
import { MemberStore } from '@store/member.store';
import { MemorizedStore } from '@store/memorized.store';
import { SplitStore } from '@store/split.store';
import { UserStore } from '@store/user.store';
import {
  browserLocalPersistence,
  User as FirebaseUser,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import {
  collectionGroup,
  doc,
  DocumentReference,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { DemoModeService } from './demo-mode.service';
import { GroupService } from './group.service';
import { IUserService } from './user.service.interface';

@Injectable({
  providedIn: 'root',
})
export class UserService implements IUserService {
  protected readonly fs = inject(getFirestore);
  protected readonly auth = inject(getAuth);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly router = inject(Router);
  protected readonly userStore = inject(UserStore);
  protected readonly expenseStore = inject(ExpenseStore);
  protected readonly groupService = inject(GroupService);
  protected readonly groupStore = inject(GroupStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly memorizedStore = inject(MemorizedStore);
  protected readonly historyStore = inject(HistoryStore);
  protected readonly splitStore = inject(SplitStore);
  protected readonly demoModeService = inject(DemoModeService);
  protected readonly functions = inject(getFunctions);

  constructor() {
    this.initializeAuth();
  }

  private async initializeAuth(): Promise<void> {
    try {
      await setPersistence(this.auth, browserLocalPersistence);
      this.auth.onAuthStateChanged(
        async (firebaseUser: FirebaseUser | null) => {
          if (!!firebaseUser) {
            try {
              // Clear all demo data from stores when a real user logs in
              this.groupStore.clearAllUserGroups();
              this.expenseStore.clearGroupExpenses();
              this.categoryStore.clearGroupCategories();
              this.memberStore.clearGroupMembers();
              this.memorizedStore.clearMemorizedExpenses();
              this.historyStore.clearHistory();
              this.splitStore.clearSplits();

              const userData = await this.createUserIfNotExists(
                firebaseUser.uid,
                firebaseUser.email!
              );
              const user = new User({
                ...userData,
                id: firebaseUser.uid,
              });
              this.userStore.initUser(
                user,
                firebaseUser.providerData[0]?.providerId === 'google.com',
                !!firebaseUser.emailVerified
              );
              await this.groupService.getUserGroups(user);
            } catch (error) {
              this.analytics.logEvent('app_error', {
                component: 'UserService',
                action: 'initializeAuth',
                message: 'Failed to initialize user',
                error: error instanceof Error ? error.message : 'Unknown error',
              });
            }
          }
        }
      );
    } catch (error) {
      this.analytics.logEvent('app_error', {
        component: 'UserService',
        action: 'initializeAuth',
        message: 'Failed to set auth persistence',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getUserDetails(userId: string): Promise<User | null> {
    try {
      const docRef = doc(this.fs, `users/${userId}`);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return new User({
          id: docSnap.id,
          ...docSnap.data(),
          ref: docRef as DocumentReference<User>,
        });
      }
      return null;
    } catch (error) {
      this.analytics.logEvent('app_error', {
        component: 'UserService',
        action: 'getUserDetails',
        message: 'Failed to get user details',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async createUserIfNotExists(userId: string, email: string): Promise<User> {
    try {
      const existingUser = await this.getUserDetails(userId);
      if (existingUser) {
        if (existingUser.email !== email) {
          const docRef = doc(this.fs, `users/${userId}`);
          await setDoc(docRef, { email }, { merge: true });
          existingUser.email = email;
        }
        return existingUser;
      }

      const docRef = doc(this.fs, `users/${userId}`);
      const defaultUserData = {
        email: email,
        defaultGroupRef: null,
        receiptPolicy: false,
        emailOptOut: false,
        venmoId: '',
        paypalId: '',
        cashAppId: '',
        zelleId: '',
      };

      await setDoc(docRef, defaultUserData);
      const userDocRef = docRef as DocumentReference<User>;

      // Link any unlinked member records with this email to the new user
      const membersQuery = query(
        collectionGroup(this.fs, 'members'),
        where('email', '==', email),
        where('userRef', '==', null)
      );
      const membersSnapshot = await getDocs(membersQuery);

      for (const memberDoc of membersSnapshot.docs) {
        await updateDoc(memberDoc.ref, { userRef: userDocRef });
      }

      if (membersSnapshot.size > 0) {
        this.analytics.logEvent('new_user_members_linked', {
          email: email,
          membersLinked: membersSnapshot.size,
        });
      }

      return new User({
        id: userId,
        ...defaultUserData,
        ref: userDocRef,
      });
    } catch (error) {
      this.analytics.logEvent('app_error', {
        component: 'UserService',
        action: 'createUserIfNotExists',
        message: 'Failed to create user',
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async updateUser(changes: Partial<User>): Promise<void> {
    try {
      const userId = this.userStore.user()!.id;
      const docRef = doc(this.fs, `users/${userId}`);
      await setDoc(docRef, changes, { merge: true });
      this.userStore.updateUser(changes);
    } catch (error) {
      this.analytics.logEvent('app_error', {
        component: 'UserService',
        action: 'updateUser',
        message: 'Failed to update user',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async updateUserEmailAndLinkMembers(newEmail: string): Promise<void> {
    const userId = this.userStore.user()!.id;
    const userDocRef = doc(
      this.fs,
      `users/${userId}`
    ) as DocumentReference<User>;

    // Update the email on the user document
    await setDoc(userDocRef, { email: newEmail }, { merge: true });
    this.userStore.updateUser({ email: newEmail });

    // Query members collection group for unlinked members with this email
    const membersQuery = query(
      collectionGroup(this.fs, 'members'),
      where('email', '==', newEmail),
      where('userRef', '==', null)
    );
    const membersSnapshot = await getDocs(membersQuery);

    // Link each matching member to this user
    for (const memberDoc of membersSnapshot.docs) {
      await updateDoc(memberDoc.ref, { userRef: userDocRef });
    }

    this.analytics.logEvent('email_verified_members_linked', {
      email: newEmail,
      membersLinked: membersSnapshot.size,
    });
  }

  async getPaymentMethods(
    memberRef: DocumentReference<Member>
  ): Promise<object> {
    try {
      const memberDoc = await getDoc(memberRef);
      if (!memberDoc.exists()) {
        return {};
      }

      const userRef = memberDoc.data()?.userRef;
      if (!userRef) {
        return {};
      }
      const userDocSnap = await getDoc(userRef);

      if (userDocSnap.exists()) {
        const data = userDocSnap.data();
        return {
          venmoId: data.venmoId ?? '',
          paypalId: data.paypalId ?? '',
          cashAppId: data.cashAppId ?? '',
          zelleId: data.zelleId ?? '',
        };
      } else {
        return {};
      }
    } catch (error) {
      this.analytics.logEvent('app_error', {
        component: 'UserService',
        action: 'getPaymentMethods',
        message: 'Failed to get payment methods',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private buildEmailHtml(content: string): string {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:#f7fbf0;font-family:Arial,sans-serif;color:#191d17;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px;"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;"><tr><td style="background-color:#105208;padding:20px 32px;border-radius:8px 8px 0 0;"><h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:bold;">PipSplit</h1></td></tr><tr><td style="background-color:#ffffff;padding:32px;">${content}</td></tr><tr><td style="background-color:#eff2e8;padding:16px 32px;border-radius:0 0 8px 8px;text-align:center;"><p style="margin:0;font-size:12px;color:#5b6058;">You received this email because you are a member of a PipSplit group.<br>To opt out, update your notification preferences in PipSplit.</p></td></tr></table></td></tr></table></body></html>`;
  }

  private buildPaymentMethodLines(userData: {
    venmoId?: string;
    paypalId?: string;
    cashAppId?: string;
    zelleId?: string;
  }): string {
    const methods: string[] = [];
    if (userData.venmoId)
      methods.push(`Venmo: @${userData.venmoId.replace(/^@/, '')}`);
    if (userData.paypalId) methods.push(`PayPal: ${userData.paypalId}`);
    if (userData.cashAppId) methods.push(`Cash App: $${userData.cashAppId}`);
    if (userData.zelleId) methods.push(`Zelle: ${userData.zelleId}`);
    return methods.length > 0
      ? methods.join('\n')
      : '(No payment methods on file)';
  }

  private buildPaymentMethodsHtml(methods: string): string {
    if (methods === '(No payment methods on file)') {
      return `<p style="color:#5b6058;margin:0;font-style:italic;">(No payment methods on file)</p>`;
    }
    return methods
      .split('\n')
      .map((line) => `<p style="margin:2px 0;">${this.escapeHtml(line)}</p>`)
      .join('');
  }

  private async callSendEmail(
    to: string,
    subject: string,
    text: string,
    html: string
  ): Promise<void> {
    const fn = httpsCallable<
      { to: string; subject: string; text: string; html: string },
      { success: boolean }
    >(this.functions, 'sendEmail');
    await fn({ to, subject, text, html });
  }

  async sendPaymentRequestEmail(
    owedByMember: Member,
    owedToMember: Member,
    groupName: string,
    formattedAmount: string
  ): Promise<'sent' | 'not_registered' | 'opted_out'> {
    if (!owedByMember.userRef) {
      return 'not_registered';
    }
    const owedByUserDoc = await getDoc(owedByMember.userRef);
    if (
      owedByUserDoc.exists() &&
      owedByUserDoc.data()?.['emailOptOut'] === true
    ) {
      return 'opted_out';
    }
    let paymentMethodLines = '(No payment methods on file)';
    if (owedToMember.userRef) {
      const owedToUserDoc = await getDoc(owedToMember.userRef);
      if (owedToUserDoc.exists()) {
        paymentMethodLines = this.buildPaymentMethodLines(
          owedToUserDoc.data() as {
            venmoId?: string;
            paypalId?: string;
            cashAppId?: string;
            zelleId?: string;
          }
        );
      }
    }
    const subject = `Payment request from ${owedToMember.displayName} for group "${groupName}" in PipSplit`;
    const text = [
      `Hi ${owedByMember.displayName},`,
      '',
      `${owedToMember.displayName} is requesting payment of ${formattedAmount} in the "${groupName}" group via PipSplit.`,
      '',
      `Please log in to PipSplit to mark this balance as paid, or send the payment directly to ${owedToMember.displayName} using one of the following:`,
      paymentMethodLines,
    ].join('\n');
    const pmHtml = this.buildPaymentMethodsHtml(paymentMethodLines);
    const html = this.buildEmailHtml(
      `<h2 style="color:#105208;margin:0 0 20px 0;">Payment Request</h2>` +
        `<p style="margin:0 0 16px 0;">Hi <strong>${this.escapeHtml(owedByMember.displayName)}</strong>,</p>` +
        `<p style="margin:0 0 16px 0;"><strong>${this.escapeHtml(owedToMember.displayName)}</strong> is requesting payment of:</p>` +
        `<div style="background-color:#cdebbf;border-radius:8px;padding:20px;text-align:center;margin:0 0 20px 0;"><span style="font-size:28px;font-weight:bold;color:#105208;">${this.escapeHtml(formattedAmount)}</span></div>` +
        `<p style="margin:0 0 16px 0;">in the <strong>&ldquo;${this.escapeHtml(groupName)}&rdquo;</strong> group via PipSplit.</p>` +
        `<p style="margin:0 0 16px 0;">Please log in to PipSplit to mark this balance as paid, or send the payment directly to <strong>${this.escapeHtml(owedToMember.displayName)}</strong> using one of the following:</p>` +
        `<div style="background-color:#f7fbf0;border:1px solid #c4c8be;border-radius:8px;padding:16px;">${pmHtml}</div>`
    );
    await this.callSendEmail(owedByMember.email, subject, text, html);
    return 'sent';
  }

  async sendGroupPaymentRequestEmails(
    transfers: {
      owedByMember: Member;
      owedToMember: Member;
      formattedAmount: string;
    }[],
    groupName: string
  ): Promise<{ sent: number; skipped: number }> {
    const eligible = transfers.filter((t) => !!t.owedByMember.userRef);
    const skippedNoAccount = transfers.length - eligible.length;

    const owedByUserDocs = await Promise.all(
      eligible.map((t) => getDoc(t.owedByMember.userRef!))
    );

    const notOptedOut = eligible.filter((_, i) => {
      const doc = owedByUserDocs[i];
      return !doc?.exists() || doc.data()?.['emailOptOut'] !== true;
    });
    const skippedOptedOut = eligible.length - notOptedOut.length;

    const owedToUserDocs = await Promise.all(
      notOptedOut.map((t) =>
        t.owedToMember.userRef
          ? getDoc(t.owedToMember.userRef)
          : Promise.resolve(null)
      )
    );

    await Promise.all(
      notOptedOut.map((t, i) => {
        const owedToDoc = owedToUserDocs[i];
        const paymentMethodLines = owedToDoc?.exists()
          ? this.buildPaymentMethodLines(
              owedToDoc.data() as {
                venmoId?: string;
                paypalId?: string;
                cashAppId?: string;
                zelleId?: string;
              }
            )
          : '(No payment methods on file)';
        const subject = `Payment request from ${t.owedToMember.displayName} for group "${groupName}" in PipSplit`;
        const text = [
          `Hi ${t.owedByMember.displayName},`,
          '',
          `${t.owedToMember.displayName} is requesting payment of ${t.formattedAmount} in the "${groupName}" group via PipSplit.`,
          '',
          `Please log in to PipSplit to mark this balance as paid, or send the payment directly to ${t.owedToMember.displayName} using one of the following:`,
          paymentMethodLines,
        ].join('\n');
        const pmHtml = this.buildPaymentMethodsHtml(paymentMethodLines);
        const html = this.buildEmailHtml(
          `<h2 style="color:#105208;margin:0 0 20px 0;">Payment Request</h2>` +
            `<p style="margin:0 0 16px 0;">Hi <strong>${this.escapeHtml(t.owedByMember.displayName)}</strong>,</p>` +
            `<p style="margin:0 0 16px 0;"><strong>${this.escapeHtml(t.owedToMember.displayName)}</strong> is requesting payment of:</p>` +
            `<div style="background-color:#cdebbf;border-radius:8px;padding:20px;text-align:center;margin:0 0 20px 0;"><span style="font-size:28px;font-weight:bold;color:#105208;">${this.escapeHtml(t.formattedAmount)}</span></div>` +
            `<p style="margin:0 0 16px 0;">in the <strong>&ldquo;${this.escapeHtml(groupName)}&rdquo;</strong> group via PipSplit.</p>` +
            `<p style="margin:0 0 16px 0;">Please log in to PipSplit to mark this balance as paid, or send the payment directly to <strong>${this.escapeHtml(t.owedToMember.displayName)}</strong> using one of the following:</p>` +
            `<div style="background-color:#f7fbf0;border:1px solid #c4c8be;border-radius:8px;padding:16px;">${pmHtml}</div>`
        );
        return this.callSendEmail(t.owedByMember.email, subject, text, html);
      })
    );

    return {
      sent: notOptedOut.length,
      skipped: skippedNoAccount + skippedOptedOut,
    };
  }

  async sendMemberPaymentUnpayEmails(
    paidByMember: Member | undefined,
    paidToMember: Member | undefined,
    groupName: string,
    formattedAmount: string,
    splitCount: number
  ): Promise<void> {
    const expenseWord = splitCount === 1 ? 'expense' : 'expenses';
    const sends: Promise<void>[] = [];

    if (paidByMember?.userRef && paidByMember.email) {
      const userDoc = await getDoc(paidByMember.userRef);
      if (!userDoc.exists() || userDoc.data()?.['emailOptOut'] !== true) {
        const paidToName = paidToMember?.displayName ?? 'another member';
        const subject = `A payment from you to ${paidToName} in PipSplit has been reversed`;
        const text = [
          `Hi ${paidByMember.displayName},`,
          '',
          `A payment of ${formattedAmount} from you to ${paidToName} in the group "${groupName}" has been reversed in PipSplit.`,
          '',
          `The ${splitCount} shared ${expenseWord} covered by this payment have been marked as unpaid and will appear in your outstanding balance again.`,
        ].join('\n');
        const html = this.buildEmailHtml(
          `<h2 style="color:#ba1a1a;margin:0 0 20px 0;">Payment Reversed</h2>` +
            `<p style="margin:0 0 16px 0;">Hi <strong>${this.escapeHtml(paidByMember.displayName)}</strong>,</p>` +
            `<p style="margin:0 0 16px 0;">A payment of <strong>${this.escapeHtml(formattedAmount)}</strong> from you to <strong>${this.escapeHtml(paidToName)}</strong> in the <strong>&ldquo;${this.escapeHtml(groupName)}&rdquo;</strong> group has been reversed in PipSplit.</p>` +
            `<p style="margin:0;">The ${splitCount} shared ${this.escapeHtml(expenseWord)} covered by this payment have been marked as unpaid and will appear in your outstanding balance again.</p>`
        );
        sends.push(this.callSendEmail(paidByMember.email, subject, text, html));
      }
    }

    if (paidToMember?.userRef && paidToMember.email) {
      const userDoc = await getDoc(paidToMember.userRef);
      if (!userDoc.exists() || userDoc.data()?.['emailOptOut'] !== true) {
        const paidByName = paidByMember?.displayName ?? 'another member';
        const subject = `A payment from ${paidByName} to you in PipSplit has been reversed`;
        const text = [
          `Hi ${paidToMember.displayName},`,
          '',
          `A payment of ${formattedAmount} from ${paidByName} to you in the group "${groupName}" has been reversed in PipSplit.`,
          '',
          `The ${splitCount} shared ${expenseWord} covered by this payment have been marked as unpaid and will appear in the outstanding balance again.`,
        ].join('\n');
        const html = this.buildEmailHtml(
          `<h2 style="color:#ba1a1a;margin:0 0 20px 0;">Payment Reversed</h2>` +
            `<p style="margin:0 0 16px 0;">Hi <strong>${this.escapeHtml(paidToMember.displayName)}</strong>,</p>` +
            `<p style="margin:0 0 16px 0;">A payment of <strong>${this.escapeHtml(formattedAmount)}</strong> from <strong>${this.escapeHtml(paidByName)}</strong> to you in the <strong>&ldquo;${this.escapeHtml(groupName)}&rdquo;</strong> group has been reversed in PipSplit.</p>` +
            `<p style="margin:0;">The ${splitCount} shared ${this.escapeHtml(expenseWord)} covered by this payment have been marked as unpaid and will appear in the outstanding balance again.</p>`
        );
        sends.push(this.callSendEmail(paidToMember.email, subject, text, html));
      }
    }

    await Promise.all(sends);
  }

  async sendGroupSettleUnpayEmails(
    members: Member[],
    groupName: string,
    settleDate: string
  ): Promise<void> {
    const eligible = members.filter((m) => !!m.userRef && !!m.email);
    const userDocs = await Promise.all(eligible.map((m) => getDoc(m.userRef!)));
    await Promise.all(
      eligible
        .filter((_, i) => userDocs[i]?.data()?.['emailOptOut'] !== true)
        .map((m) => {
          const subject = `The group settle for "${groupName}" has been reversed in PipSplit`;
          const text = [
            `Hi ${m.displayName},`,
            '',
            `A group admin has reversed the group settlement for "${groupName}" that was recorded on ${settleDate}.`,
            '',
            'All outstanding balances have been restored. Please check your current balance in PipSplit.',
          ].join('\n');
          const html = this.buildEmailHtml(
            `<h2 style="color:#ba1a1a;margin:0 0 20px 0;">Group Settlement Reversed</h2>` +
              `<p style="margin:0 0 16px 0;">Hi <strong>${this.escapeHtml(m.displayName)}</strong>,</p>` +
              `<p style="margin:0 0 16px 0;">A group admin has reversed the group settlement for <strong>&ldquo;${this.escapeHtml(groupName)}&rdquo;</strong> that was recorded on <strong>${this.escapeHtml(settleDate)}</strong>.</p>` +
              `<p style="margin:0;">All outstanding balances have been restored. Please check your current balance in PipSplit.</p>`
          );
          return this.callSendEmail(m.email, subject, text, html);
        })
    );
  }

  async logout(redirect: boolean = true): Promise<void> {
    await this.auth.signOut();
    this.groupService.logout();
    this.userStore.clearUser();
    if (redirect) {
      this.router.navigate([ROUTE_PATHS.HOME]);
    }
  }
}
