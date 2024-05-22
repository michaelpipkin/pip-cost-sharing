import { Router } from '@angular/router';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { User } from '@models/user';
import { LoadingService } from '@shared/loading/loading.service';
import { UserService } from './user.service';

import {
  computed,
  effect,
  inject,
  Injectable,
  Signal,
  signal,
} from '@angular/core';
import {
  doc,
  Firestore,
  getDoc,
  collectionGroup,
  query,
  where,
  getDocs,
  collection,
  writeBatch,
  onSnapshot,
  orderBy,
} from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class GroupService {
  fs = inject(Firestore);
  loading = inject(LoadingService);
  router = inject(Router);
  userService = inject(UserService);

  allUserGroups = signal<Group[]>([]);
  activeUserGroups = computed(() =>
    this.allUserGroups().filter((g) => g.active)
  );
  private adminGroupIds = signal<string[]>([]);
  adminUserGroups = computed(() =>
    this.allUserGroups().filter((g) => this.adminGroupIds().includes(g.id))
  );
  currentGroup = signal<Group>(null);

  user: Signal<User> = this.userService.user;

  userLoaded = computed(() => {
    if (!!this.user()) {
      this.loading.loadingOn();
      const user = this.user();
      this.getUserGroups(user.id).then(async () => {
        const activeUserGroups = this.activeUserGroups();
        if (activeUserGroups.length === 1) {
          await this.getGroupById(activeUserGroups[0].id).then(() => {
            this.router
              .navigateByUrl('/expenses')
              .then(() => this.loading.loadingOff());
          });
        } else if (user.defaultGroupId !== '') {
          await this.getGroupById(user.defaultGroupId).then(() => {
            this.router
              .navigateByUrl('/expenses')
              .then(() => this.loading.loadingOff());
          });
        } else {
          this.router
            .navigateByUrl('/groups')
            .then(() => this.loading.loadingOff());
        }
      });
    }
  });

  constructor() {
    effect(() => {
      this.userLoaded();
    });
  }

  async getUserGroups(userId: string): Promise<void> {
    const memberQuery = query(
      collectionGroup(this.fs, 'members'),
      where('userId', '==', userId)
    );
    onSnapshot(memberQuery, (memberQuerySnap) => {
      const userGroups: { groupId: string; groupAdmin: boolean }[] = [
        ...memberQuerySnap.docs.map((d) => {
          return {
            groupId: d.ref.parent.parent.id,
            groupAdmin: d.data().groupAdmin,
          };
        }),
      ];
      const groupQuery = query(collection(this.fs, 'groups'), orderBy('name'));
      onSnapshot(groupQuery, (groupQuerySnap) => {
        const userGroupIds = userGroups.map((m) => m.groupId);
        this.adminGroupIds.set(
          userGroups.filter((f) => f.groupAdmin).map((m) => m.groupId)
        );
        const groups: Group[] = [
          ...groupQuerySnap.docs.map(
            (d) => new Group({ id: d.id, ...d.data() })
          ),
        ].filter((g) => userGroupIds.includes(g.id));
        this.allUserGroups.set(groups);
      });
    });
  }

  async getGroupById(id: string): Promise<void> {
    const docSnap = await getDoc(doc(this.fs, `groups/${id}`));
    const group = new Group({
      id: docSnap.id,
      ...docSnap.data(),
    });
    this.currentGroup.set(group);
  }

  async addGroup(group: Partial<Group>, member: Partial<Member>): Promise<any> {
    const batch = writeBatch(this.fs);
    const groupRef = doc(collection(this.fs, 'groups'));
    batch.set(groupRef, group);
    const memberRef = doc(collection(this.fs, `groups/${groupRef.id}/members`));
    batch.set(memberRef, member);
    return await batch
      .commit()
      .then(() => {
        return true;
      })
      .catch((err: Error) => {
        return new Error(err.message);
      });
  }

  async updateGroup(groupId: string, changes: Partial<Group>): Promise<any> {
    const batch = writeBatch(this.fs);
    const groupRef = doc(this.fs, `groups/${groupId}`);
    batch.update(groupRef, changes);
    if (!changes.active) {
      const usersRef = collection(this.fs, 'users');
      const usersQuery = query(
        usersRef,
        where('defaultGroupId', '==', groupId)
      );
      await getDocs(usersQuery).then((users) => {
        users.forEach((u) => {
          batch.update(u.ref, { defaultGroupId: '' });
        });
      });
    }
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
