import { DocumentReference } from 'firebase/firestore';
import { Group } from './group';

export class User {
  constructor(init?: Partial<User>) {
    Object.assign(this, init);
  }
  id!: string;
  email!: string;
  defaultGroupRef?: DocumentReference<Group> | null;
  venmoId?: string = '';
  paypalId?: string = '';
  cashAppId?: string = '';
  zelleId?: string = '';
  language?: string = 'en';
  receiptPolicy?: boolean = false;
  emailOptOut?: boolean = false;
  ref?: DocumentReference<User>;
}

export interface LoginForm {
  email: string;
  password: string;
}

export interface ForgotPasswordForm {
  email: string;
}

export interface PasswordForm {
  password: string;
  confirmPassword: string;
}

export interface RegisterForm {
  email: string;
  password: string;
  confirmPassword: string;
}

export interface ProfileForm {
  email: string;
}

export interface PaymentsForm {
  venmoId: string;
  paypalId: string;
  cashAppId: string;
  zelleId: string;
}

export interface PreferencesForm {
  groupRef: DocumentReference<Group> | null;
}
