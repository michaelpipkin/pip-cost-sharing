import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { addDoc, collection, Firestore } from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ApiKeyService {
  fs = inject(Firestore);
  http = inject(HttpClient);

  async generateApiKey(userName: string): Promise<string> {
    const apiKey = crypto.randomUUID().toString();

    const encryptedData = await firstValueFrom(
      this.http.post<{
        encryptedApiKey: string;
        iv: string;
      }>(`${environment.cloudFunctionsBaseUrl}/encryptApiKey`, {
        apiKey: apiKey,
      })
    );

    const encryptedApiKey = encryptedData.encryptedApiKey;
    const iv = encryptedData.iv;

    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const apiKeyHash = hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Store the encrypted API key and its hash in Firestore
    const apiKeysCollection = collection(this.fs, 'apiKeys');
    await addDoc(apiKeysCollection, {
      encryptedApiKey: encryptedApiKey,
      apiKeyHash: apiKeyHash,
      userName: userName,
      dateCreated: new Date(),
      iv: iv,
    });

    return apiKey;
  }
}
