import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { MemberService } from '@services/member.service';
import { createMockLoadingService } from '@testing/test-helpers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmGroupEmailComponent } from './confirm-group-email.component';

describe('ConfirmGroupEmailComponent', () => {
  let fixture: ComponentFixture<ConfirmGroupEmailComponent>;
  let el: HTMLElement;
  let confirm: ReturnType<typeof vi.fn>;
  let mockLoading: ReturnType<typeof createMockLoadingService>;

  /** A callable rejection, as the Functions SDK raises it. */
  const callableError = (code: string, message = 'refused') =>
    Object.assign(new Error(message), { code: `functions/${code}` });

  async function createComponent(
    queryParams: Record<string, string>,
    result: () => Promise<unknown>
  ) {
    confirm = vi.fn(result);
    mockLoading = createMockLoadingService();
    const params = new Map(Object.entries(queryParams));
    await TestBed.configureTestingModule({
      imports: [ConfirmGroupEmailComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: { get: (key: string) => params.get(key) ?? null },
            },
          },
        },
        {
          provide: MemberService,
          useValue: { confirmMemberEmailChange: confirm },
        },
        { provide: LoadingService, useValue: mockLoading },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmGroupEmailComponent);
    el = fixture.nativeElement;
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const text = (testId: string) =>
    el.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim();

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('confirms the token once, behind the loading overlay', async () => {
    await createComponent({ token: 'tok-1' }, async () => ({
      groupId: 'group-1',
      email: 'new@example.com',
    }));
    // More change detection never confirms again.
    fixture.detectChanges();
    await fixture.whenStable();

    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith('tok-1');
    expect(mockLoading.loadingOn).toHaveBeenCalledOnce();
    expect(mockLoading.loadingOff).toHaveBeenCalledOnce();
  });

  it('shows the new group email and a link to the Members page', async () => {
    await createComponent({ token: 'tok-1' }, async () => ({
      groupId: 'group-1',
      email: 'new@example.com',
    }));

    expect(text('confirm-group-email-success')).toBe(
      'Your group email is now new@example.com.'
    );
    const link = el.querySelector(
      '[data-testid="confirm-group-email-members-link"]'
    ) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/administration/members');
    expect(el.querySelector('[data-testid="confirm-group-email-error"]')).toBeNull();
  });

  it('explains an expired or used link (failed-precondition)', async () => {
    await createComponent({ token: 'tok-1' }, async () => {
      throw callableError('failed-precondition');
    });

    expect(text('confirm-group-email-error')).toBe(
      "This link has expired or was already used. Request a new one from the group's Members page."
    );
    expect(mockLoading.loadingOff).toHaveBeenCalledOnce();
  });

  it('asks for the requesting account (permission-denied)', async () => {
    await createComponent({ token: 'tok-1' }, async () => {
      throw callableError('permission-denied');
    });

    expect(text('confirm-group-email-error')).toBe(
      'Sign in with the account that requested this change.'
    );
  });

  // MemberService.confirmMemberEmailChange logs the unexpected failure.
  it('reports any other failure', async () => {
    await createComponent({ token: 'tok-1' }, async () => {
      throw callableError('internal', 'boom');
    });

    expect(text('confirm-group-email-error')).toBe(
      'Something went wrong - your group email could not be confirmed. Please try the link again.'
    );
    expect(mockLoading.loadingOff).toHaveBeenCalledOnce();
  });

  it('treats a link without a token as expired, without calling the server', async () => {
    await createComponent({}, async () => ({}));

    expect(confirm).not.toHaveBeenCalled();
    expect(text('confirm-group-email-error')).toBe(
      "This link has expired or was already used. Request a new one from the group's Members page."
    );
  });
});
