import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { getApp, initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { AngularFireModule } from '@angular/fire/compat';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { BrowserModule } from '@angular/platform-browser';
import {
  BrowserAnimationsModule,
  provideAnimations,
} from '@angular/platform-browser/animations';
import { provideRouter, TitleStrategy } from '@angular/router';
import { AuthInterceptor } from '@services/auth.interceptor';
import { PageTitleStrategyService } from '@services/page-title-strategy.service';
import { LoadingService } from '@shared/loading/loading.service';
import { appRoutes } from './app.routes';
import { FirebaseConfig } from './firebase.config';
import { environment } from '../environments/environment';
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
  ScreenTrackingService,
  UserTrackingService,
} from '@angular/fire/analytics';
import {
  AngularFireAnalytics,
  AngularFireAnalyticsModule,
} from '@angular/fire/compat/analytics';
import {
  AngularFireAuthModule,
  USE_EMULATOR as USE_AUTH_EMULATOR,
} from '@angular/fire/compat/auth';
import {
  AngularFirestoreModule,
  USE_EMULATOR as USE_FIRESTORE_EMULATOR,
} from '@angular/fire/compat/firestore';
import {
  AngularFireStorageModule,
  USE_EMULATOR as USE_STORAGE_EMULATOR,
} from '@angular/fire/compat/storage';
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
    provideRouter(appRoutes),
    provideAnimations(),
    importProvidersFrom([
      BrowserModule,
      AngularFireModule.initializeApp(FirebaseConfig),
      AngularFireAnalyticsModule,
      AngularFirestoreModule,
      AngularFireAuthModule,
      AngularFireStorageModule,
      FormsModule,
      ReactiveFormsModule,
      MatDatepickerModule,
      MatNativeDateModule,
      MatIconModule,
      BrowserAnimationsModule,
    ]),
    provideFirebaseApp(() => initializeApp(FirebaseConfig)),
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
      } as MatDialogConfig,
    },
    {
      provide: MAT_SNACK_BAR_DEFAULT_OPTIONS,
      useValue: {
        verticalPosition: 'top',
        duration: 5000,
      } as MatSnackBarConfig,
    },
    {
      provide: USE_FIRESTORE_EMULATOR,
      useValue: environment.useEmulators ? ['localhost', 8080] : undefined,
    },
    {
      provide: USE_AUTH_EMULATOR,
      useValue: environment.useEmulators
        ? ['http://localhost:9099']
        : undefined,
    },
    {
      provide: USE_STORAGE_EMULATOR,
      useValue: environment.useEmulators ? ['localhost', 9199] : undefined,
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true,
    },
    LoadingService,
    AngularFireAnalytics,
    ScreenTrackingService,
    UserTrackingService,
    MatDatepickerModule,
  ],
};
