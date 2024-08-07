import { TestBed } from '@angular/core/testing';
import { getApp, initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { environment } from 'src/environments/environment';
import { CategoryService } from './category.service';
import { SortingService } from './sorting.service';
import { FirebaseConfig } from '../firebase.config';
import {
  connectFirestoreEmulator,
  FirestoreModule,
  initializeFirestore,
  provideFirestore,
} from '@angular/fire/firestore';

describe('CategoryService', () => {
  let service: CategoryService;
  const useEmulators = environment.useEmulators;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
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
        FirestoreModule,
      ],
      providers: [CategoryService, SortingService],
    });

    service = TestBed.inject(CategoryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
