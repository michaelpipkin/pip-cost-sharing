import { DecimalPipe } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { SplitExpenseForm, SplitItemForm } from '@models/split';
import { AnalyticsService } from '@services/analytics.service';
import { CalculatorOverlayService } from '@services/calculator-overlay.service';
import { DemoService } from '@services/demo.service';
import { LocaleService } from '@services/locale.service';
import { TourService } from '@services/tour.service';
import { GroupStore } from '@store/group.store';
import {
  createMockAnalyticsService,
  createMockCalculatorOverlayService,
  createMockDemoService,
  createMockGroupStore,
  createMockMatDialog,
  createMockSnackBar,
  createMockTourService,
  mockGroup,
} from '@testing/test-helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SplitComponent } from './split.component';

describe('SplitComponent', () => {
  let fixture: ComponentFixture<SplitComponent>;
  let component: SplitComponent;
  let el: HTMLElement;
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockDemoService: ReturnType<typeof createMockDemoService>;
  let mockTourService: ReturnType<typeof createMockTourService>;
  let mockDialog: ReturnType<typeof createMockMatDialog>;

  function getModel(): SplitExpenseForm {
    return (component as any).expenseModel();
  }

  function patchModel(patch: Partial<SplitExpenseForm>): void {
    (component as any).expenseModel.update((m: SplitExpenseForm) => ({
      ...m,
      ...patch,
    }));
  }

  function patchSplit(index: number, patch: Partial<SplitItemForm>): void {
    (component as any).expenseModel.update((m: SplitExpenseForm) => ({
      ...m,
      splits: m.splits.map((s: SplitItemForm, i: number) =>
        i === index ? { ...s, ...patch } : s
      ),
    }));
  }

  beforeEach(async () => {
    mockGroupStore = createMockGroupStore();
    mockDemoService = createMockDemoService();
    mockTourService = createMockTourService();
    mockDialog = createMockMatDialog();

    mockGroupStore.currentGroup.set(mockGroup({ currencyCode: 'USD' }));

    await TestBed.configureTestingModule({
      imports: [SplitComponent],
      providers: [
        provideRouter([]),
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: DemoService, useValue: mockDemoService },
        { provide: TourService, useValue: mockTourService },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: MatDialog, useValue: mockDialog },
        {
          provide: CalculatorOverlayService,
          useValue: createMockCalculatorOverlayService(),
        },
        LocaleService,
        DecimalPipe,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SplitComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

  describe('initial render', () => {
    it('should render page title', () => {
      expect(query('split-page-title')?.textContent?.trim()).toBe(
        'Split Expense'
      );
    });

    it('should render currency selector defaulted to USD', () => {
      const currencySelect = query('split-currency-select');
      expect(currencySelect).toBeTruthy();
      expect(getModel().currencyCode).toBe('USD');
    });

    it('should render help button', () => {
      expect(query('split-help-button')).toBeTruthy();
    });

    it('should not show tour button when not in demo mode', () => {
      expect(query('split-tour-button')).toBeFalsy();
    });

    it('should have empty splits array initially', () => {
      expect(getModel().splits.length).toBe(0);
    });
  });

  describe('currency handling', () => {
    it('should populate currency dropdown with supported currencies', () => {
      expect(component.supportedCurrencies.length).toBeGreaterThan(0);
      expect(component.supportedCurrencies.some((c) => c.code === 'USD')).toBe(
        true
      );
      expect(component.supportedCurrencies.some((c) => c.code === 'JPY')).toBe(
        true
      );
    });

    it('should update local currency when currency changes', async () => {
      patchModel({ currencyCode: 'EUR' });
      component.onCurrencyChange();
      await fixture.whenStable();

      expect(component.localCurrency().code).toBe('EUR');
    });

    it('should reset form when currency changes', async () => {
      component.addSplit();
      patchModel({ amount: '100.00' });
      await fixture.whenStable();

      patchModel({ currencyCode: 'JPY' });
      component.onCurrencyChange();
      await fixture.whenStable();

      expect(parseFloat(getModel().amount)).toBe(0);
      expect(getModel().splits.length).toBe(0);
      expect(getModel().currencyCode).toBe('JPY');
    });

    it('should restore group currency on destroy', () => {
      const localeService = TestBed.inject(LocaleService);
      const spy = vi.spyOn(localeService, 'setGroupCurrency');

      fixture.destroy();

      expect(spy).toHaveBeenCalledWith('USD');
    });
  });

  describe('model split operations', () => {
    it('should add split to model', () => {
      expect(getModel().splits.length).toBe(0);
      component.addSplit();
      expect(getModel().splits.length).toBe(1);
    });

    it('should remove split from model', () => {
      component.addSplit();
      component.addSplit();
      expect(getModel().splits.length).toBe(2);

      component.removeSplit(0);
      expect(getModel().splits.length).toBe(1);
    });

    it('should create split with all required fields', () => {
      component.addSplit();
      const split = getModel().splits[0];

      expect(split).toHaveProperty('owedBy');
      expect(split).toHaveProperty('assignedAmount');
      expect(split).toHaveProperty('percentage');
      expect(split).toHaveProperty('shares');
      expect(split).toHaveProperty('allocatedAmount');
    });

    it('should trigger recalculation when adding split', () => {
      const spy = vi.spyOn(component, 'allocateSharedAmounts');
      component.addSplit();
      expect(spy).toHaveBeenCalled();
    });

    it('should trigger recalculation when removing split', () => {
      component.addSplit();
      component.addSplit();
      const spy = vi.spyOn(component, 'allocateSharedAmounts');

      component.removeSplit(0);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('amount mode allocation', () => {
    it('should allocate equally when all assigned amounts are zero', async () => {
      component.addSplit();
      component.addSplit();
      component.addSplit();

      patchSplit(0, { owedBy: 'Alice' });
      patchSplit(1, { owedBy: 'Bob' });
      patchSplit(2, { owedBy: 'Charlie' });

      patchModel({
        amount: '60.00',
        sharedAmount: 60,
        allocatedAmount: '0.00',
      });

      component.allocateSharedAmounts();
      await fixture.whenStable();

      expect(getModel().splits[0]!.allocatedAmount).toBe(20);
      expect(getModel().splits[1]!.allocatedAmount).toBe(20);
      expect(getModel().splits[2]!.allocatedAmount).toBe(20);
    });

    it('should handle uneven split with rounding', async () => {
      component.addSplit();
      component.addSplit();
      component.addSplit();

      patchSplit(0, { owedBy: 'Alice' });
      patchSplit(1, { owedBy: 'Bob' });
      patchSplit(2, { owedBy: 'Charlie' });

      patchModel({
        amount: '10.00',
        sharedAmount: 10,
        allocatedAmount: '0.00',
      });

      component.allocateSharedAmounts();
      await fixture.whenStable();

      const total =
        getModel().splits[0]!.allocatedAmount +
        getModel().splits[1]!.allocatedAmount +
        getModel().splits[2]!.allocatedAmount;

      expect(total).toBe(10);
      const amounts = [
        getModel().splits[0]!.allocatedAmount,
        getModel().splits[1]!.allocatedAmount,
        getModel().splits[2]!.allocatedAmount,
      ];
      expect(amounts.some((a) => a === 3.34)).toBe(true);
    });

    it('should allocate proportionally with personal amounts', async () => {
      component.addSplit();
      component.addSplit();
      component.addSplit();

      patchSplit(0, { owedBy: 'Alice', assignedAmount: '30.00' });
      patchSplit(1, { owedBy: 'Bob', assignedAmount: '30.00' });
      patchSplit(2, { owedBy: 'Charlie', assignedAmount: '20.00' });

      patchModel({
        amount: '100.00',
        sharedAmount: 0,
        allocatedAmount: '20.00',
      });

      component.allocateSharedAmounts();
      await fixture.whenStable();

      expect(getModel().splits[0]!.allocatedAmount).toBeCloseTo(37.5, 1);
      expect(getModel().splits[1]!.allocatedAmount).toBeCloseTo(37.5, 1);
      expect(getModel().splits[2]!.allocatedAmount).toBeCloseTo(25, 1);
    });

    it('should respect currency decimal places (USD = 2)', async () => {
      component.addSplit();
      patchSplit(0, { owedBy: 'Alice' });

      patchModel({
        amount: '10.55',
        sharedAmount: 10.55,
        allocatedAmount: '0.00',
      });

      component.allocateSharedAmounts();
      await fixture.whenStable();

      const allocated = getModel().splits[0]!.allocatedAmount;
      expect(allocated.toFixed(2)).toBe('10.55');
    });

    it('should respect currency decimal places (JPY = 0)', async () => {
      patchModel({ currencyCode: 'JPY' });
      component.onCurrencyChange();
      await fixture.whenStable();

      component.addSplit();
      patchSplit(0, { owedBy: 'Alice' });

      patchModel({
        amount: '1000',
        sharedAmount: 1000,
        allocatedAmount: '0',
      });

      component.allocateSharedAmounts();
      await fixture.whenStable();

      const allocated = getModel().splits[0]!.allocatedAmount;
      expect(allocated % 1).toBe(0);
    });

    it('should trigger recalculation when total amount changes', () => {
      const spy = vi.spyOn(component, 'allocateSharedAmounts');
      component.updateTotalAmount();
      expect(spy).toHaveBeenCalled();
    });

    it('should calculate correct assigned total', () => {
      component.addSplit();
      component.addSplit();

      patchSplit(0, { assignedAmount: '25.00' });
      patchSplit(1, { assignedAmount: '35.00' });

      expect(component.getAssignedTotal()).toBe(60);
    });

    it('should calculate correct allocated total', () => {
      component.addSplit();
      component.addSplit();

      patchSplit(0, { allocatedAmount: 40 });
      patchSplit(1, { allocatedAmount: 60 });

      expect(component.getAllocatedTotal()).toBe(100);
    });
  });

  describe('percentage mode', () => {
    beforeEach(async () => {
      component.splitMethod.set('percentage');
      await fixture.whenStable();
    });

    it('should show percentage inputs when in percentage mode', () => {
      expect(component.splitMethod()).toBe('percentage');
    });

    it('should allocate by percentage correctly', async () => {
      component.addSplit();
      component.addSplit();

      patchSplit(0, { owedBy: 'member-1' });
      patchSplit(1, { owedBy: 'member-2' });
      patchModel({ amount: '100.00' });
      patchSplit(0, { percentage: 60 });
      patchSplit(1, { percentage: 40 });

      component.allocateByPercentage();
      await fixture.whenStable();

      expect(getModel().splits[0]!.allocatedAmount).toBe(60);
      expect(getModel().splits[1]!.allocatedAmount).toBe(40);
    });

    it('should handle proportional amounts in percentage mode', async () => {
      component.addSplit();
      component.addSplit();

      patchSplit(0, { owedBy: 'member-1' });
      patchSplit(1, { owedBy: 'member-2' });
      patchModel({ amount: '100.00', allocatedAmount: '10.00' });

      patchSplit(0, { percentage: 50 });
      patchSplit(1, { percentage: 50 });

      component.allocateByPercentage();
      await fixture.whenStable();

      expect(getModel().splits[0]!.allocatedAmount).toBe(50);
      expect(getModel().splits[1]!.allocatedAmount).toBe(50);
    });

    it('should toggle back to amount mode', async () => {
      component.splitMethod.set('amount');
      await fixture.whenStable();

      expect(component.splitMethod()).toBe('amount');
    });

    it('should preserve calculated allocations when toggling modes', async () => {
      component.addSplit();
      patchSplit(0, { owedBy: 'member-1' });
      patchModel({ amount: '100.00' });
      patchSplit(0, { percentage: 100 });
      component.allocateByPercentage();
      await fixture.whenStable();

      expect(getModel().splits[0]!.allocatedAmount).toBe(100);

      component.splitMethod.set('amount');
      await fixture.whenStable();

      expect(getModel().splits[0]!.allocatedAmount).toBe(100);
    });
  });

  describe('shares mode', () => {
    beforeEach(async () => {
      component.splitMethod.set('shares');
      await fixture.whenStable();
    });

    it('should be in shares mode', () => {
      expect(component.splitMethod()).toBe('shares');
    });

    it('should allocate by share ratio [1, 1, 2] on $100', async () => {
      component.addSplit();
      component.addSplit();
      component.addSplit();

      patchSplit(0, { owedBy: 'Alice', shares: 1 });
      patchSplit(1, { owedBy: 'Bob', shares: 1 });
      patchSplit(2, { owedBy: 'Charlie', shares: 2 });

      patchModel({ amount: '100.00' });

      component.allocateByShares();
      await fixture.whenStable();

      expect(getModel().splits[0]!.allocatedAmount).toBe(25);
      expect(getModel().splits[1]!.allocatedAmount).toBe(25);
      expect(getModel().splits[2]!.allocatedAmount).toBe(50);
    });

    it('should total correctly with share ratio [1, 1, 2]', async () => {
      component.addSplit();
      component.addSplit();
      component.addSplit();

      patchSplit(0, { owedBy: 'Alice', shares: 1 });
      patchSplit(1, { owedBy: 'Bob', shares: 1 });
      patchSplit(2, { owedBy: 'Charlie', shares: 2 });

      patchModel({ amount: '100.00' });

      component.allocateByShares();
      await fixture.whenStable();

      const total =
        getModel().splits[0]!.allocatedAmount +
        getModel().splits[1]!.allocatedAmount +
        getModel().splits[2]!.allocatedAmount;
      expect(total).toBe(100);
    });
  });

  describe('form validation', () => {
    it('should require amount to be non-zero', () => {
      patchModel({ amount: '0.00' });
      const errors = (component as any).expenseForm.amount().errors() as {
        kind: string;
      }[];
      expect(errors.some((e) => e.kind === 'zeroAmount')).toBe(true);
    });

    it('should require amount field', () => {
      patchModel({ amount: '' });
      const errors = (component as any).expenseForm.amount().errors() as {
        kind: string;
      }[];
      expect(errors.some((e) => e.kind === 'required')).toBe(true);
    });

    it('should require owedBy for each split', () => {
      component.addSplit();
      patchSplit(0, { owedBy: '' });
      const errors = (component as any).expenseForm.splits[0].owedBy().errors() as {
        kind: string;
      }[];
      expect(errors.some((e) => e.kind === 'required')).toBe(true);
    });

    it('should check if expense is fully allocated', () => {
      component.addSplit();
      patchModel({ amount: '100.00' });
      patchSplit(0, { allocatedAmount: 100 });

      expect(component.expenseFullyAllocated()).toBe(true);
    });
  });

  describe('summary generation', () => {
    beforeEach(async () => {
      component.addSplit();
      component.addSplit();

      patchSplit(0, {
        owedBy: 'Alice',
        assignedAmount: '30.00',
        allocatedAmount: 50,
      });
      patchSplit(1, {
        owedBy: 'Bob',
        assignedAmount: '30.00',
        allocatedAmount: 50,
      });

      patchModel({
        amount: '100.00',
        sharedAmount: 20,
        allocatedAmount: '20.00',
      });
    });

    it('should set submitted signal when form submitted', () => {
      expect(component.submitted()).toBe(false);
      component.onSubmit();
      expect(component.submitted()).toBe(true);
    });

    it('should generate summary text with totals', () => {
      const summary = component.generateSummaryText();

      expect(summary).toContain('Total');
      expect(summary).toContain('100.00');
    });

    it('should include per-member breakdown in summary', () => {
      const summary = component.generateSummaryText();

      expect(summary).toContain('Alice');
      expect(summary).toContain('Bob');
      expect(summary).toContain('50.00');
    });

    it('should copy summary to clipboard', async () => {
      const clipboardSpy = vi.fn(() => Promise.resolve());
      Object.assign(navigator, {
        clipboard: {
          writeText: clipboardSpy,
        },
      });

      await component.copySummaryToClipboard();

      expect(clipboardSpy).toHaveBeenCalled();
    });
  });

  describe('demo mode', () => {
    beforeEach(async () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      await TestBed.resetTestingModule();

      await TestBed.configureTestingModule({
        imports: [SplitComponent],
        providers: [
          provideRouter([]),
          { provide: GroupStore, useValue: mockGroupStore },
          { provide: DemoService, useValue: mockDemoService },
          { provide: TourService, useValue: mockTourService },
          { provide: AnalyticsService, useValue: createMockAnalyticsService() },
          { provide: MatSnackBar, useValue: createMockSnackBar() },
          { provide: MatDialog, useValue: mockDialog },
          {
            provide: CalculatorOverlayService,
            useValue: createMockCalculatorOverlayService(),
          },
          LocaleService,
          DecimalPipe,
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(SplitComponent);
      component = fixture.componentInstance;
      el = fixture.nativeElement;
    });

    it('should populate demo data with Alice, Bob, Charlie', async () => {
      await fixture.whenStable();

      expect(getModel().splits.length).toBe(3);
    });

    it('should show tour button in demo mode', async () => {
      await fixture.whenStable();

      expect(query('split-tour-button')).toBeTruthy();
    });

    it('should start welcome tour in demo mode', async () => {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(mockTourService.startWelcomeTour).toHaveBeenCalled();
    });
  });

  describe('methods', () => {
    it('should open help dialog', () => {
      component.showHelp();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    it('should delegate startTour to tourService', () => {
      component.startTour();
      expect(mockTourService.startWelcomeTour).toHaveBeenCalledWith(true);
    });

    it('should reset form while preserving currency', () => {
      component.addSplit();
      patchModel({ currencyCode: 'EUR', amount: '100.00' });

      component.resetForm();

      expect(parseFloat(getModel().amount)).toBe(0);
      expect(getModel().splits.length).toBe(0);
      expect(getModel().currencyCode).toBe('EUR');
      expect(component.submitted()).toBe(false);
    });
  });
});
