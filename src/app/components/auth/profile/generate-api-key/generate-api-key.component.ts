import { Component, inject, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ApiKeyService } from '@services/api-key.service';
import {
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

@Component({
  selector: 'app-generate-api-key',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatButtonModule,
    MatInputModule,
  ],
  templateUrl: './generate-api-key.component.html',
  styleUrl: './generate-api-key.component.scss',
})
export class GenerateApiKeyComponent {
  fb = inject(FormBuilder);
  apiKeyService = inject(ApiKeyService);

  apiKey = model<string>('');

  apiForm = this.fb.group({
    userName: ['', Validators.required],
  });

  public get f() {
    return this.apiForm.controls;
  }

  generateApiKey(): void {
    this.apiForm.disable();
    const userName = this.apiForm.value.userName;
    this.apiKey.set('Generating...');
    this.apiKeyService.generateApiKey(userName).then((apiKey) => {
      this.apiKey.set(apiKey);
      this.apiForm.enable();
    });
  }
}
