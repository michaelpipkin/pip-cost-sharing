export interface IUser {
  id: string;
  email: string;
  defaultGroupId: string;
  venmoId?: string;
  paypalId?: string;
  cashAppId?: string;
  zelleId?: string;
}

export class User implements IUser {
  constructor(init?: Partial<User>) {
    Object.assign(this, init);
  }
  id: string;
  email: string;
  defaultGroupId: string;
  venmoId?: string = '';
  paypalId?: string = '';
  cashAppId?: string = '';
  zelleId?: string = '';
}
