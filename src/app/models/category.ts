export interface ICategory {
  id: string;
  name: string;
  active: boolean;
}

export class Category implements ICategory {
  constructor(init?: Partial<Category>) {
    Object.assign(this, init);
  }
  id: string;
  name: string;
  active: boolean = true;
}
