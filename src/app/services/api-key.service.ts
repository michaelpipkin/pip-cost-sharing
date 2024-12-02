import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ApiKeyService {
  fs = inject(Firestore);
  http = inject(HttpClient);

  async generateApiKey(userName: string): Promise<string> {
    const apiKey = await firstValueFrom(
      this.http.post<{
        apiKey: string;
      }>(`${environment.cloudFunctionsBaseUrl}/encryptApiKey`, {
        userName: userName,
      })
    );

    return apiKey.apiKey;
  }
}
