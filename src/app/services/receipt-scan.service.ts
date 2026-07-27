import { inject, Injectable } from '@angular/core';
import { ParsedReceipt } from '@models/receipt-scan';
import { getFunctions, httpsCallable } from 'firebase/functions';

@Injectable({
  providedIn: 'root',
})
export class ReceiptScanService {
  protected readonly functions = inject(getFunctions);

  async scanReceipt(groupId: string, file: File): Promise<ParsedReceipt> {
    const imageBase64 = await this.#fileToBase64(file);
    const scanFn = httpsCallable<
      { groupId: string; imageBase64: string },
      ParsedReceipt
    >(this.functions, 'scanReceipt');
    const result = await scanFn({ groupId, imageBase64 });
    return result.data;
  }

  #fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1] ?? '');
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
}
