import { DecimalPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DateAdapter, MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { BrowserModule } from '@angular/platform-browser';
import { provideRouter, TitleStrategy } from '@angular/router';
import { environment } from '@env/environment';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { PageTitleStrategyService } from '@services/page-title-strategy.service';
import { LoadingService } from '@shared/loading/loading.service';
import { getAnalytics } from 'firebase/analytics';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { appRoutes } from './app.routes';
import { firebaseConfig } from './firebase.config';
import { CustomDateAdapter } from './utilities/custom-date-adapter.service';
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import {
  ApplicationConfig,
  importProvidersFrom,
  provideZonelessChangeDetection,
} from '@angular/core';
import {
  MAT_DIALOG_DEFAULT_OPTIONS,
  MatDialogConfig,
} from '@angular/material/dialog';
import {
  MAT_SNACK_BAR_DEFAULT_OPTIONS,
  MatSnackBarConfig,
} from '@angular/material/snack-bar';

const useEmulators = environment.useEmulators;

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const firestore = getFirestore(app);
const storage = getStorage(app);
const analytics = getAnalytics(app);
const functions = getFunctions(app);

// Connect to emulators if in development mode
if (useEmulators) {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(firestore, 'localhost', 8080);
  connectStorageEmulator(storage, 'localhost', 9199);
  connectFunctionsEmulator(functions, 'localhost', 5001);
}

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: getAuth, useValue: auth },
    { provide: getFirestore, useValue: firestore },
    { provide: getStorage, useValue: storage },
    { provide: getAnalytics, useValue: analytics },
    { provide: getFunctions, useValue: functions },
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptorsFromDi()),
    importProvidersFrom(
      BrowserModule,
      FormsModule,
      ReactiveFormsModule,
      MatNativeDateModule,
      MatDatepickerModule,
      MatIconModule
    ),
    provideRouter(appRoutes),
    provideTranslateService({
      fallbackLang: 'en',
    }),
    provideTranslateHttpLoader({
      prefix: './assets/i18n/',
      suffix: '.json',
    }),
    { provide: TitleStrategy, useClass: PageTitleStrategyService },
    { provide: DateAdapter, useClass: CustomDateAdapter },
    { provide: MAT_DIALOG_DEFAULT_OPTIONS, useValue: new MatDialogConfig() },
    {
      provide: MAT_SNACK_BAR_DEFAULT_OPTIONS,
      useValue: {
        verticalPosition: 'top',
        duration: 4000,
      } as MatSnackBarConfig,
    },
    LoadingService,
    DecimalPipe,
  ],
};
