export interface IUserData {
  id: string;
  defaultGroupId: string;
}

export class UserData implements IUserData {
  constructor(init?: Partial<UserData>) {
    Object.assign(this, init);
  }
  id: string;
  defaultGroupId: string;
}
