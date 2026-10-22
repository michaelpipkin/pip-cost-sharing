import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogClose } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { MailDocument } from '@models/mail';
import { afterEach, describe, expect, it } from 'vitest';
import { EmailDetailDialogComponent } from './email-detail-dialog.component';

function mockMail(overrides: Partial<MailDocument> = {}): MailDocument {
  return {
    id: 'mail-1',
    to: 'user@example.com',
    message: { subject: 'Welcome aboard' },
    delivery: {
      state: 'SUCCESS',
      attempts: 2,
      startTime: { toDate: () => new Date(2024, 0, 15, 14, 5) } as any,
    },
    ...overrides,
  };
}

describe('EmailDetailDialogComponent', () => {
  let fixture: ComponentFixture<EmailDetailDialogComponent>;
  let component: EmailDetailDialogComponent;
  let el: HTMLElement;

  async function createComponent(data: MailDocument): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [EmailDetailDialogComponent],
      providers: [{ provide: MAT_DIALOG_DATA, useValue: data }],
    }).compileComponents();

    fixture = TestBed.createComponent(EmailDetailDialogComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  }

  function labels(): (string | undefined)[] {
    return [...el.querySelectorAll('dt')].map((dt) => dt.textContent?.trim());
  }

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  describe('formatRecipient()', () => {
    it('should return a string recipient unchanged', async () => {
      await createComponent(mockMail());
      expect(component.formatRecipient('a@example.com')).toBe('a@example.com');
    });

    it('should join an array of recipients with comma-space', async () => {
      await createComponent(mockMail());
      expect(component.formatRecipient(['a@example.com', 'b@example.com'])).toBe(
        'a@example.com, b@example.com'
      );
    });

    it('should return an empty string for an empty array', async () => {
      await createComponent(mockMail());
      expect(component.formatRecipient([])).toBe('');
    });
  });

  describe('rendering', () => {
    it('should show the recipient, subject, state, attempts and date', async () => {
      await createComponent(mockMail({ to: ['a@example.com', 'b@example.com'] }));
      const text = el.textContent ?? '';
      expect(text).toContain('a@example.com, b@example.com');
      expect(text).toContain('Welcome aboard');
      expect(text).toContain('SUCCESS');
      expect(text).toMatch(/01\/15\/24 2:05\sPM/);
      const dds = [...el.querySelectorAll('dd')].map((dd) =>
        dd.textContent?.trim()
      );
      expect(dds[labels().indexOf('Attempts')]).toBe('2');
    });

    it('should show only recipient and subject when there is no delivery block', async () => {
      await createComponent(mockMail({ delivery: undefined }));
      expect(labels()).toEqual(['Recipient', 'Subject']);
    });

    it('should omit the optional error, SMTP and completed rows when absent', async () => {
      await createComponent(mockMail());
      expect(labels()).toEqual([
        'Recipient',
        'Subject',
        'State',
        'Attempts',
        'Date / Time',
      ]);
    });

    it('should show the full error, SMTP response, accepted, rejected and completed time when present', async () => {
      await createComponent(
        mockMail({
          delivery: {
            state: 'ERROR',
            attempts: 3,
            startTime: { toDate: () => new Date(2024, 0, 15, 14, 5) } as any,
            endTime: { toDate: () => new Date(2024, 0, 15, 14, 9) } as any,
            error: 'Mailbox unavailable',
            info: {
              messageId: 'm-1',
              accepted: ['ok1@example.com', 'ok2@example.com'],
              rejected: ['bad@example.com'],
              response: '550 No such user',
            },
          },
        })
      );
      expect(labels()).toEqual([
        'Recipient',
        'Subject',
        'State',
        'Attempts',
        'Date / Time',
        'Full Error',
        'SMTP Response',
        'Accepted',
        'Rejected',
        'Completed',
      ]);
      const text = el.textContent ?? '';
      expect(text).toContain('Mailbox unavailable');
      expect(text).toContain('550 No such user');
      expect(text).toContain('ok1@example.com, ok2@example.com');
      expect(text).toContain('bad@example.com');
      expect(text).toMatch(/Jan 15, 2024, 2:09:00\sPM/);
    });

    it('should hide the Accepted and Rejected rows when those lists are empty', async () => {
      await createComponent(
        mockMail({
          delivery: {
            state: 'SUCCESS',
            attempts: 1,
            startTime: { toDate: () => new Date(2024, 0, 15, 14, 5) } as any,
            info: {
              messageId: 'm-1',
              accepted: [],
              rejected: [],
              response: '250 OK',
            },
          },
        })
      );
      expect(labels()).toContain('SMTP Response');
      expect(labels()).not.toContain('Accepted');
      expect(labels()).not.toContain('Rejected');
    });
  });

  describe('buttons', () => {
    it('should close with true from the Delete button', async () => {
      await createComponent(mockMail());
      const deleteBtn = fixture.debugElement.query(
        By.css('[data-testid="email-detail-delete-button"]')
      );
      const closeDir = deleteBtn.injector.get(MatDialogClose, null);
      expect(closeDir?.dialogResult).toBe(true);
    });

    it('should not close with true from the Close button', async () => {
      await createComponent(mockMail());
      const closeBtn = fixture.debugElement.query(
        By.css('[data-testid="email-detail-close-button"]')
      );
      const closeDir = closeBtn.injector.get(MatDialogClose, null);
      expect(closeDir).not.toBeNull();
      expect(closeDir?.dialogResult).toBeFalsy();
    });
  });
});
