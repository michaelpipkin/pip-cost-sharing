import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
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
  let navigate: ReturnType<typeof vi.fn>;
  let route: unknown;

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
    route = {
      snapshot: {
        queryParamMap: { get: (key: string) => params.get(key) ?? null },
      },
    };
    await TestBed.configureTestingModule({
      imports: [ConfirmGroupEmailComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: route },
        {
          provide: MemberService,
          useValue: { confirmMemberEmailChange: confirm },
        },
        { provide: LoadingService, useValue: mockLoading },
      ],
    }).compileComponents();

    navigate = vi.fn().mockResolvedValue(true);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(
      navigate as any
    );
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

  // M5: the token must not stay in the URL (analytics and ad scripts
  // record page URLs). It is stripped once, before the server answers.
  it('removes the token from the URL once, before the server answers', async () => {
    let resolveConfirm!: (value: unknown) => void;
    await createComponent(
      { token: 'tok-1' },
      () => new Promise((resolve) => (resolveConfirm = resolve))
    );

    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith([], {
      relativeTo: route,
      queryParams: {},
      replaceUrl: true,
    });
    resolveConfirm({ groupId: 'group-1', email: 'new@example.com' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledOnce();
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
      throw callableError(
        'failed-precondition',
        'This link has expired or was already used.'
      );
    });

    expect(text('confirm-group-email-error')).toBe(
      "This link has expired or was already used. Request a new one from the group's Members page."
    );
    expect(mockLoading.loadingOff).toHaveBeenCalledOnce();
  });

  it('asks for the requesting account (permission-denied)', async () => {
    await createComponent({ token: 'tok-1' }, async () => {
      throw callableError(
        'permission-denied',
        'Sign in with the account that requested this change.'
      );
    });

    expect(text('confirm-group-email-error')).toBe(
      'Sign in with the account that requested this change.'
    );
  });

  // M3: each server outcome has its own stable message to map.
  it.each([
    [
      'failed-precondition',
      'This group membership is no longer linked to your account.',
      "You're no longer linked to this group membership, so the change can't be applied.",
    ],
    [
      'already-exists',
      'A member with this email address already exists in the group.',
      'Another member of this group already uses that address.',
    ],
    [
      'permission-denied',
      'Verify your login email first.',
      'Verify your login email first.',
    ],
    [
      'permission-denied',
      'User must be an active member of the group',
      "You're no longer an active member of this group, so the change can't be applied.",
    ],
  ])('maps %s "%s"', async (code, message, shown) => {
    await createComponent({ token: 'tok-1' }, async () => {
      throw callableError(code, message);
    });

    expect(text('confirm-group-email-error')).toBe(shown);
  });

  it('does not guess: an unknown message under a known code is a failure', async () => {
    await createComponent({ token: 'tok-1' }, async () => {
      throw callableError('failed-precondition', 'Something new');
    });

    expect(text('confirm-group-email-error')).toBe(
      'Something went wrong - your group email could not be confirmed. Please try the link again.'
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
