export class Category {
  constructor(init?: Partial<Category>) {
    Object.assign(this, init);
  }
  id: string;
  name: string;
  active: boolean = true;
}
