export interface IUser {
  id: string;
  email: string;
  defaultGroupId: string;
}

export class User implements IUser {
  constructor(init?: Partial<User>) {
    Object.assign(this, init);
  }
  id: string;
  email: string;
  defaultGroupId: string;
}
