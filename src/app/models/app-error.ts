import { Timestamp } from 'firebase/firestore';

export interface AppError {
  id: string;
  component: string;
  action: string;
  message: string;
  error?: string;
  timestamp: Timestamp;
}
