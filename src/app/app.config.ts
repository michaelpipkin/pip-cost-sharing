import { DecimalPipe } from '@angular/common';
import {
  ApplicationConfig,
  importProvidersFrom,
  provideExperimentalZonelessChangeDetection,
} from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DateAdapter, MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  MAT_DIALOG_DEFAULT_OPTIONS,
  MatDialogConfig,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import {
  MAT_SNACK_BAR_DEFAULT_OPTIONS,
  MatSnackBarConfig,
} from '@angular/material/snack-bar';
import { BrowserModule } from '@angular/platform-browser';
import {
  BrowserAnimationsModule,
  provideAnimations,
} from '@angular/platform-browser/animations';
import { provideRouter, TitleStrategy } from '@angular/router';
import { PageTitleStrategyService } from '@services/page-title-strategy.service';
import { LoadingService } from '@shared/loading/loading.service';
import { getAnalytics } from 'firebase/analytics';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';
import { firebaseConfig } from './firebase.config';
import { CustomDateAdapter } from './utilities/custom-date-adapter.service';

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
    provideExperimentalZonelessChangeDetection(),
    importProvidersFrom(
      BrowserModule,
      FormsModule,
      ReactiveFormsModule,
      BrowserAnimationsModule,
      MatNativeDateModule,
      MatDatepickerModule,
      MatIconModule
    ),
    provideAnimations(),
    provideRouter(appRoutes),
    { provide: TitleStrategy, useClass: PageTitleStrategyService },
    { provide: DateAdapter, useClass: CustomDateAdapter },
    { provide: MAT_DIALOG_DEFAULT_OPTIONS, useValue: new MatDialogConfig() },
    {
      provide: MAT_SNACK_BAR_DEFAULT_OPTIONS,
      useValue: {
        verticalPosition: 'top',
        duration: 5000,
      } as MatSnackBarConfig,
    },
    LoadingService,
    DecimalPipe,
  ],
};
