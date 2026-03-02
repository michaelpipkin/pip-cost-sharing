import { Timestamp } from 'firebase/firestore';

export interface MailDeliveryInfo {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string;
}

export interface MailDelivery {
  state: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR' | 'RETRY';
  attempts: number;
  startTime: Timestamp;
  endTime?: Timestamp;
  error?: string;
  info?: MailDeliveryInfo;
}

export interface MailDocument {
  id: string;
  to: string | string[];
  message: {
    subject: string;
    text?: string;
    html?: string;
  };
  delivery?: MailDelivery;
}
