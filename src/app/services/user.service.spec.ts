import { TestBed, waitForAsync } from '@angular/core/testing';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { Auth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { provideRouter } from '@angular/router';
import { GroupService } from './group.service';
import { UserService } from './user.service';
import { FirebaseConfig } from '../firebase.config';

// Mocks for dependencies
class MockAuth {}

describe('UserService', () => {
  let service: UserService;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [
        provideFirebaseApp(() => initializeApp(FirebaseConfig)),
        provideFirestore(() => getFirestore()),
        provideRouter,
      ],
      providers: [
        UserService,
        { provide: Auth, useClass: MockAuth }, // Provide or mock Auth
        GroupService,
      ],
    }).compileComponents();

    service = TestBed.inject(UserService);
  }));

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should not get a default group', () => {
    service.getDefaultGroup('').then((groupId: string) => {
      expect(groupId).toBe('');
    });
  });

  it('should get a default group', () => {
    service
      .getDefaultGroup('cgrizSOG69QiNquzKOA69ls8clFm')
      .then((groupId: string) => {
        expect(groupId).toBe('G5L5nkg25rnJjNYdOrb2');
      });
  });
});
