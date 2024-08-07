import { DecimalPipe } from '@angular/common';
import { getApp, initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { connectAuthEmulator, getAuth, provideAuth } from '@angular/fire/auth';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DateAdapter, MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { BrowserModule } from '@angular/platform-browser';
import { provideRouter, TitleStrategy } from '@angular/router';
import { PageTitleStrategyService } from '@services/page-title-strategy.service';
import { LoadingService } from '@shared/loading/loading.service';
import { appRoutes } from './app.routes';
import { FirebaseConfig } from './firebase.config';
import { CustomDateAdapter } from './utilities/custom-date-adapter.service';
import { environment } from '../environments/environment';
import {
  ApplicationConfig,
  importProvidersFrom,
  provideExperimentalZonelessChangeDetection,
} from '@angular/core';
import {
  BrowserAnimationsModule,
  provideAnimations,
} from '@angular/platform-browser/animations';
import {
  provideStorage,
  getStorage,
  connectStorageEmulator,
} from '@angular/fire/storage';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  provideFirestore,
} from '@angular/fire/firestore';
import {
  getAnalytics,
  provideAnalytics,
  ScreenTrackingService,
  UserTrackingService,
} from '@angular/fire/analytics';
import {
  MAT_DIALOG_DEFAULT_OPTIONS,
  MatDialogConfig,
} from '@angular/material/dialog';
import {
  MAT_SNACK_BAR_DEFAULT_OPTIONS,
  MatSnackBarConfig,
} from '@angular/material/snack-bar';

const useEmulators = environment.useEmulators;

export const appConfig: ApplicationConfig = {
  providers: [
    provideExperimentalZonelessChangeDetection(),
    provideRouter(appRoutes),
    provideAnimations(),
    importProvidersFrom([
      BrowserModule,
      FormsModule,
      ReactiveFormsModule,
      MatDatepickerModule,
      MatNativeDateModule,
      MatIconModule,
      BrowserAnimationsModule,
    ]),
    provideFirebaseApp(() => initializeApp(FirebaseConfig)),
    provideAuth(() => {
      const auth = getAuth();
      if (useEmulators) {
        connectAuthEmulator(auth, 'http://localhost:9099', {
          disableWarnings: true,
        });
      }
      return auth;
    }),
    provideAnalytics(() => getAnalytics()),
    provideFirestore(() => {
      const firestore = initializeFirestore(getApp(), {
        experimentalAutoDetectLongPolling: useEmulators ? true : false,
      });
      if (useEmulators) {
        connectFirestoreEmulator(firestore, 'localhost', 8080);
      }
      return firestore;
    }),
    provideStorage(() => {
      const storage = getStorage();
      if (useEmulators) {
        connectStorageEmulator(storage, 'localhost', 9199);
      }
      return storage;
    }),
    {
      provide: TitleStrategy,
      useClass: PageTitleStrategyService,
    },
    {
      provide: MAT_DIALOG_DEFAULT_OPTIONS,
      useValue: {
        disableClose: true,
        autoFocus: true,
        maxWidth: '95vw',
        maxHeight: '95vh',
      } as MatDialogConfig,
    },
    {
      provide: MAT_SNACK_BAR_DEFAULT_OPTIONS,
      useValue: {
        verticalPosition: 'top',
        duration: 5000,
      } as MatSnackBarConfig,
    },
    LoadingService,
    ScreenTrackingService,
    UserTrackingService,
    MatDatepickerModule,
    DecimalPipe,
    { provide: DateAdapter, useClass: CustomDateAdapter },
  ],
};
