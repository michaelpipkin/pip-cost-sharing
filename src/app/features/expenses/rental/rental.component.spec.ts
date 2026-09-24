import { BreakpointObserver } from '@angular/cdk/layout';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { GuidedTourConfig } from '@models/guided-tour';
import { AnalyticsService } from '@services/analytics.service';
import { GuidedTourService } from '@services/guided-tour.service';
import { LocaleService } from '@services/locale.service';
import { MemberStore } from '@store/member.store';
import {
  createMockAnalyticsService,
  createMockMatDialog,
  createMockMemberStore,
  mockDocRef,
  mockMember,
} from '@testing/test-helpers';
import * as firestoreModule from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RentalComponent } from './rental.component';

describe('RentalComponent', () => {
  let fixture: ComponentFixture<RentalComponent>;
  let component: RentalComponent;
  let el: HTMLElement;
  let mockMemberStore: ReturnType<typeof createMockMemberStore>;

  const me = mockMember({
    id: 'me',
    displayName: 'Pat',
    ref: mockDocRef('groups/group-1/members/me'),
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    // Sample members get local refs, which the grid and rooms key by id
    vi.spyOn(firestoreModule, 'doc').mockImplementation(
      (_fs: unknown, path: string) => mockDocRef(path)
    );
    mockMemberStore = createMockMemberStore();
    mockMemberStore.currentMember.set(me);
    mockMemberStore.groupMembers.set([me]);

    await TestBed.configureTestingModule({
      imports: [RentalComponent],
      providers: [
        provideRouter([]),
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: MatDialog, useValue: createMockMatDialog() },
        {
          provide: BreakpointObserver,
          useValue: {
            isMatched: vi.fn(() => false),
            observe: vi.fn(() => ({
              subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
            })),
          },
        },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
        { provide: getFirestore, useValue: {} },
        LocaleService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RentalComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
  });

  // The wizard's state is protected; the tests read it the way the page does
  const page = () => component as any;

  it('should start with every active member for one night', () => {
    expect(
      page()
        .members()
        .map((r: any) => r.displayName)
    ).toEqual(['Pat']);
    expect(page().nightCount()).toBe(1);
  });

  it('should wait for the members to load, then add them only once', async () => {
    const bob = mockMember({
      id: 'bob',
      displayName: 'Bob',
      ref: mockDocRef('groups/group-1/members/bob'),
    });
    const cal = mockMember({
      id: 'cal',
      displayName: 'Cal',
      ref: mockDocRef('groups/group-1/members/cal'),
    });
    // A refresh or direct link renders the page before the members load
    mockMemberStore.loaded.set(false);
    mockMemberStore.groupMembers.set([]);
    const late = TestBed.createComponent(RentalComponent);
    const latePage = late.componentInstance as any;
    const render = async () => {
      late.detectChanges();
      await late.whenStable();
    };
    const lateNames = () => latePage.members().map((r: any) => r.displayName);
    await render();
    expect(latePage.members()).toEqual([]);

    mockMemberStore.groupMembers.set([me, bob]);
    mockMemberStore.loaded.set(true);
    await render();
    expect(lateNames()).toEqual(['Pat', 'Bob']);

    // Later member updates don't overwrite who the user has set up
    mockMemberStore.groupMembers.set([me, bob, cal]);
    await render();
    expect(lateNames()).toEqual(['Pat', 'Bob']);
    late.destroy();
  });

  describe('guided tour', () => {
    let tourConfig: GuidedTourConfig;
    let startSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      startSpy = vi
        .spyOn(TestBed.inject(GuidedTourService), 'start')
        .mockImplementation(async (config) => {
          tourConfig = config;
        });
    });

    const runStep = async (id: string) =>
      tourConfig.steps.find((s) => s.id === id)!.beforeShow?.();
    const names = () =>
      page()
        .members()
        .map((r: any) => r.displayName);

    it('should start the vacation rental tour from the help icon', () => {
      (el.querySelector('[data-testid="help-button"]') as HTMLElement).click();

      expect(startSpy).toHaveBeenCalledOnce();
      expect(tourConfig.id).toBe('vacation-rental');
    });

    it('should fill in a sample stay where the wizard is at its defaults', async () => {
      component.startTour();
      await runStep('intro');

      expect(page().amount()).toBe('1200.00');
      expect(page().nightCount()).toBe(4);
      // The real member first, then sample people to make three
      expect(names()).toEqual(['Pat', 'Alex', 'Jordan']);
      expect(
        page()
          .members()
          .map((r: any) => r.nights)
      ).toEqual([
        [true, true, true, true],
        [true, true, true, true],
        [true, true, true, false],
      ]);
      expect(page().canContinue()).toBe(true);
    });

    it('should still show three people when the grid is empty', async () => {
      page().members.set([]);
      component.startTour();
      await runStep('intro');

      expect(names()).toEqual(['Alex', 'Jordan', 'Sam']);
    });

    it('should keep what is already entered', async () => {
      page().amount.set('500.00');
      page().nightCount.set(2);
      component.startTour();
      await runStep('intro');

      expect(page().amount()).toBe('500.00');
      expect(page().nightCount()).toBe(2);
    });

    it('should turn on sample room rates for the room steps only', async () => {
      component.startTour();
      await runStep('intro');

      await runStep('rooms');
      expect(page().roomsEnabled()).toBe(true);
      expect(
        page()
          .rooms()
          .map((r: any) => r.name)
      ).toEqual(['Master Suite', 'Bunk Room']);
      expect(page().roomAssignments()).toEqual({
        me: 'tour-sample-suite',
        'tour-sample-alex': 'tour-sample-bunk',
        'tour-sample-jordan': 'tour-sample-bunk',
      });

      await runStep('nights');
      expect(page().roomsEnabled()).toBe(false);
    });

    it('should put the wizard back exactly when it ends', async () => {
      const members = page().members();
      component.startTour();
      await runStep('intro');
      await runStep('rooms');

      tourConfig.onEnd!('closed');
      expect(page().members()).toBe(members);
      expect(page().amount()).toBe('0.00');
      expect(page().nightCount()).toBe(1);
      expect(page().roomsEnabled()).toBe(false);
      expect(page().rooms()).toEqual([]);
      expect(page().roomAssignments()).toEqual({});
    });

    it('should stop the tour when the page is destroyed', () => {
      const stopSpy = vi.spyOn(TestBed.inject(GuidedTourService), 'stop');
      fixture.destroy();
      expect(stopSpy).toHaveBeenCalledWith('closed');
    });
  });
});
