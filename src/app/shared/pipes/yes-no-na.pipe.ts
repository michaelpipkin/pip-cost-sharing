import { Pipe, PipeTransform } from '@angular/core';
import { DocumentReference } from 'firebase/firestore';

@Pipe({
  name: 'yesNoNa',
  standalone: true,
})
export class YesNoNaPipe implements PipeTransform {
  transform(value: unknown, ...args: unknown[]): unknown {
    // Check if both args are document references
    if (
      this.isDocumentReference(args[0]) &&
      this.isDocumentReference(args[1])
    ) {
      // Compare paths for document references
      if (args[0].path === args[1].path) {
        return 'N/A';
      }
    } else {
      // Compare values directly for non-document references
      if (args[0] === args[1]) {
        return 'N/A';
      }
    }

    return value ? 'Yes' : 'No';
  }

  private isDocumentReference(obj: unknown): obj is DocumentReference {
    return obj != null && typeof obj === 'object' && 'path' in obj;
  }
}
