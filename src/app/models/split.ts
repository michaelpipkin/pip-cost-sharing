export interface ISplit {
  id: string;
  amount: number;
  userId: string;
  paid: boolean;
}

export class Split implements ISplit {
  constructor(init?: Partial<Split>) {
    Object.assign(this, init);
  }
  id: string;
  amount: number;
  userId: string;
  paid: boolean = false;
}
