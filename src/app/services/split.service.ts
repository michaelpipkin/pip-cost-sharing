import { Expense } from '@models/expense';
import { Group } from '@models/group';
import { Split } from '@models/split';
import { LoadingService } from '@shared/loading/loading.service';
import { collection, writeBatch } from 'firebase/firestore';
import { GroupService } from './group.service';
import {
  computed,
  effect,
  inject,
  Injectable,
  Signal,
  signal,
} from '@angular/core';
import {
  collectionGroup,
  doc,
  Firestore,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class SplitService {
  fs = inject(Firestore);
  loading = inject(LoadingService);
  groupService = inject(GroupService);

  currentGroup: Signal<Group> = this.groupService.currentGroup;

  unpaidSplits = signal<Split[]>([]);

  groupSelected = computed(async () => {
    if (!!this.currentGroup()) {
      this.loading.loadingOn();
      await this.getUnpaidSplitsForGroup(this.currentGroup().id).then(() =>
        this.loading.loadingOff()
      );
    }
  });

  constructor() {
    effect(() => {
      this.groupSelected();
    });
  }

  async addDatesToSplits() {
    const expDocs = await getDocs(collectionGroup(this.fs, `expenses`));
    const expenses = expDocs.docs.map(
      (e) => new Expense({ id: e.id, ...e.data() })
    );
    const splitDocs = await getDocs(collectionGroup(this.fs, 'splits'));
    splitDocs.docs.forEach(async (d) => {
      const expense = expenses.find((e) => e.id === d.data().expenseId);
      if (!!expense) {
        await updateDoc(d.ref, { date: expense.date });
      }
    });
  }

  async getUnpaidSplitsForGroup(groupId: string): Promise<void> {
    const splitsQuery = query(
      collection(this.fs, `groups/${groupId}/splits`),
      where('paid', '==', false),
      where('date', '!=', null)
    );
    onSnapshot(splitsQuery, (splitsQuerySnap) => {
      const splits = [
        ...splitsQuerySnap.docs.map((d) => {
          return new Split({
            id: d.id,
            ...d.data(),
          });
        }),
      ];
      this.unpaidSplits.set(splits);
    });
  }

  async updateSplit(
    groupId: string,
    splitId: string,
    changes: Partial<Split>
  ): Promise<any> {
    return await updateDoc(
      doc(this.fs, `groups/${groupId}/splits/${splitId}`),
      changes
    );
  }

  async paySplitsBetweenMembers(
    groupId: string,
    splits: Split[]
  ): Promise<any> {
    const batch = writeBatch(this.fs);
    splits.forEach((split) => {
      batch.update(doc(this.fs, `groups/${groupId}/splits/${split.id}`), {
        paid: true,
      });
    });
    return await batch
      .commit()
      .then(() => {
        return true;
      })
      .catch((err: Error) => {
        return new Error(err.message);
      });
  }
}
