export interface IMember {
  id: string;
  userId: string;
  groupId: string;
  displayName: string;
  email: string;
  active: boolean;
  groupAdmin: boolean;
  readonly activeText: string;
  readonly groupAdminText: string;
}

export class Member implements IMember {
  constructor(init?: Partial<Member>) {
    Object.assign(this, init);
  }
  id: string;
  userId: string;
  groupId: string;
  displayName: string;
  email: string;
  active: boolean;
  groupAdmin: boolean;
  get activeText(): string {
    return this.active ? 'Active' : 'Inactive';
  }
  get groupAdminText(): string {
    return this.groupAdmin ? 'Yes' : 'No';
  }
}
