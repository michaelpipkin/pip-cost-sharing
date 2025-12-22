import { Directive, inject } from '@angular/core';
import { MatSelect } from '@angular/material/select';
import { DocumentReference } from 'firebase/firestore';

@Directive({
  selector: 'mat-select[docRefCompare]',
  standalone: true,
})
export class DocRefCompareDirective {
  private matSelect = inject(MatSelect);

  constructor() {
    this.matSelect.compareWith = this.compareDocRefs;
  }

  private compareDocRefs(
    ref1: DocumentReference,
    ref2: DocumentReference
  ): boolean {
    if (!ref1 || !ref2) return ref1 === ref2;
    return ref1.path === ref2.path;
  }
}
