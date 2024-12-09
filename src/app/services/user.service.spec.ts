import { TestBed, waitForAsync } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { GroupService } from './group.service';
import { UserService } from './user.service';
import { firebaseConfig } from '../firebase.config';

// Mocks for dependencies
class MockAuth {}

describe('UserService', () => {
  let service: UserService;

  beforeEach(waitForAsync(() => {
    const app = initializeApp(firebaseConfig);
    getFirestore(app);
    const auth = getAuth(app);
    TestBed.configureTestingModule({
      imports: [provideRouter],
      providers: [
        UserService,
        { provide: auth, useClass: MockAuth }, // Provide or mock Auth
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
