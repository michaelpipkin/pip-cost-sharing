export interface IMember {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  active: boolean;
  groupAdmin: boolean;
}

export class Member implements IMember {
  constructor(init?: Partial<Member>) {
    Object.assign(this, init);
  }
  id: string;
  userId: string;
  displayName: string;
  email: string;
  active: boolean;
  groupAdmin: boolean;
}
