export interface ICategory {
  id: string;
  groupId: string;
  name: string;
  active: boolean;
  readonly activeText: string;
}

export class Category implements ICategory {
  constructor(init?: Partial<Category>) {
    Object.assign(this, init);
  }
  id: string;
  groupId: string;
  name: string;
  active: boolean = true;
  get activeText(): string {
    return this.active ? 'Active' : 'Inactive';
  }
}
