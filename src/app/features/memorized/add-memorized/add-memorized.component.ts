import { DecimalPipe } from '@angular/common';
import {
  afterEveryRender,
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Signal,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  MatDialog,
  MatDialogConfig,
  MatDialogModule,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { SplitMethodToggleComponent } from '@components/split-method-toggle/split-method-toggle.component';
import { DocRefCompareDirective } from '@directives/doc-ref-compare.directive';
import { FormatCurrencyInputDirective } from '@directives/format-currency-input.directive';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@features/help/help-dialog/help-dialog.component';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Memorized } from '@models/memorized';
import { Split } from '@models/split';
import { AnalyticsService } from '@services/analytics.service';
import { CalculatorOverlayService } from '@services/calculator-overlay.service';
import { CategoryService } from '@services/category.service';
import { DemoService } from '@services/demo.service';
import { LocaleService } from '@services/locale.service';
import { MemorizedService } from '@services/memorized.service';
import { CurrencyPipe } from '@shared/pipes/currency.pipe';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { AllocationUtilsService } from '@utils/allocation-utils.service';
import { SplitMethod } from '@utils/split-method';
import { StringUtils } from '@utils/string-utils.service';
import { DocumentReference } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

@Component({
  selector: 'app-add-memorized',
  templateUrl: './add-memorized.component.html',
  styleUrl: './add-memorized.component.scss',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatTableModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatInputModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatIconModule,
    DecimalPipe,
    CurrencyPipe,
    FormatCurrencyInputDirective,
    DocRefCompareDirective,
    SplitMethodToggleComponent,
  ],
})
export class AddMemorizedComponent {
  protected readonly storage = inject(getStorage);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly dialog = inject(MatDialog);
  protected readonly router = inject(Router);
  protected readonly fb = inject(FormBuilder);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly categoryService = inject(CategoryService);
  protected readonly demoService = inject(DemoService);
  protected readonly memorizedService = inject(MemorizedService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly decimalPipe = inject(DecimalPipe);
  protected readonly stringUtils = inject(StringUtils);
  protected readonly allocationUtils = inject(AllocationUtilsService);
  protected readonly calculatorOverlay = inject(CalculatorOverlayService);
  protected readonly localeService = inject(LocaleService);

  splitMethod = signal<SplitMethod>('amount');

  currentMember: Signal<Member | null> = this.memberStore.currentMember;
  currentGroup: Signal<Group | null> = this.groupStore.currentGroup;
  activeMembers: Signal<Member[]> = this.memberStore.activeGroupMembers;
  readonly #categories: Signal<Category[]> = this.categoryStore.groupCategories;

  activeCategories = computed<Category[]>(() => {
    return this.#categories().filter((c) => c.active);
  });

  totalAmountField = viewChild<ElementRef>('totalAmount');
  allocatedAmountField = viewChild<ElementRef>('propAmount');
  inputElements = viewChildren<ElementRef>('inputElement');
  memberAmounts = viewChildren<ElementRef>('memberAmount');

  addMemorizedForm = this.fb.group({
    paidByMember: [this.currentMember()?.ref, Validators.required],
    date: [new Date(), Validators.required],
    amount: [0, [Validators.required, this.amountValidator()]],
    description: ['', Validators.required],
    category: [
      null as unknown as DocumentReference<Category>,
      Validators.required,
    ],
    sharedAmount: [0, Validators.required],
    allocatedAmount: [0, Validators.required],
    splits: this.fb.array([], [Validators.required, Validators.minLength(1)]),
  });

  autoAddMembers = computed<boolean>(
    () => this.currentGroup()?.autoAddMembers ?? false
  );

  constructor() {
    this.loading.loadingOn();
    afterNextRender(() => {
      this.totalAmountField()!.nativeElement.value =
        this.localeService.getFormattedZero();
      this.allocatedAmountField()!.nativeElement.value =
        this.localeService.getFormattedZero();
      this.memberAmounts().forEach((elementRef: ElementRef) => {
        elementRef.nativeElement.value = this.localeService.getFormattedZero();
      });
    });
    afterEveryRender(() => {
      this.addSelectFocus();
    });
    effect(() => {
      // Set default payer to current member if not already set
      const currentMemberRef = this.currentMember()?.ref;
      if (currentMemberRef && !this.addMemorizedForm.value.paidByMember) {
        this.addMemorizedForm.patchValue({
          paidByMember: currentMemberRef,
        });
      }
      // Auto-add members if group setting is enabled
      if (this.autoAddMembers()) {
        this.addAllActiveGroupMembers();
      }
      // Set default category if only one exists
      if (this.activeCategories().length === 1) {
        this.addMemorizedForm.patchValue({
          category: this.activeCategories()[0]!.ref,
        });
      }
      // Turn off loading once stores are populated
      if (currentMemberRef) {
        this.loading.loadingOff();
      }
    });
  }

  addSelectFocus(): void {
    this.inputElements().forEach((elementRef: ElementRef<any>) => {
      const input = elementRef.nativeElement as HTMLInputElement;
      input.addEventListener('focus', function () {
        if (this.value === '0.00') {
          this.value = '';
        } else {
          this.select();
        }
      });
    });
  }

  createSplitFormGroup(): FormGroup {
    const existingMembers = new Set(
      this.splitsFormArray.controls.map((c) => c.get('owedByMemberRef')!.value.id)
    );
    const availableMembers = this.activeMembers().filter(
      (m) => !existingMembers.has(m.id)
    );
    return this.fb.group({
      owedByMemberRef: [
        availableMembers.length > 0 ? availableMembers[0]!.ref : null,
        Validators.required,
      ],
      assignedAmount: [
        this.localeService.getFormattedZero(),
        Validators.required,
      ],
      percentage: [0],
      shares: [0],
      allocatedAmount: [0],
    });
  }

  amountValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      return control.value === 0 ? { zeroAmount: true } : null;
    };
  }

  get e() {
    return this.addMemorizedForm.controls;
  }

  get splitsFormArray(): FormArray {
    return this.addMemorizedForm.get('splits') as FormArray;
  }

  addSplit(): void {
    this.splitsFormArray.push(this.createSplitFormGroup());
    // Set the value of the newly created input element to '0.00'
    setTimeout(() => {
      const lastInput = this.memberAmounts().find(
        (i) => i.nativeElement.value === ''
      );
      if (lastInput) {
        lastInput.nativeElement.value = this.localeService.getFormattedZero();
        // Manually trigger the input event to update the mat-label
        const event = new Event('input', { bubbles: true });
        lastInput.nativeElement.dispatchEvent(event);
      }
    });
    this.recalculateAllocation();
  }

  addAllActiveGroupMembers(): void {
    const existingMembers = new Set(
      this.splitsFormArray.controls.map((c) => c.get('owedByMemberRef')!.value.id)
    );

    this.activeMembers().forEach((member: Member) => {
      if (!existingMembers.has(member.id)) {
        this.splitsFormArray.push(
          this.fb.group({
            owedByMemberRef: [member.ref, Validators.required],
            assignedAmount: [
              this.localeService.getFormattedZero(),
              Validators.required,
            ],
            percentage: [0],
            shares: [0],
            allocatedAmount: [0],
          })
        );
      }
    });
    setTimeout(() => {
      const newInputs = this.memberAmounts().filter(
        (i) => i.nativeElement.value === ''
      );
      newInputs.forEach((input) => {
        input.nativeElement.value = this.localeService.getFormattedZero();
        // Manually trigger the input event to update the mat-label
        const event = new Event('input', { bubbles: true });
        input.nativeElement.dispatchEvent(event);
      });
    });
    this.recalculateAllocation();
  }

  availableMembersForSplit(index: number): Member[] {
    const selectedMemberIds = new Set(
      this.splitsFormArray.controls
        .filter((_, i) => i !== index)
        .map((c) => c.get('owedByMemberRef')!.value)
        .filter((ref) => ref !== null)
        .map((ref) => ref.id)
    );
    return this.activeMembers().filter(
      (member) => !selectedMemberIds.has(member.id)
    );
  }

  removeSplit(index: number): void {
    this.splitsFormArray.removeAt(index);
    this.recalculateAllocation();
  }

  onSplitMethodChange(): void {
    this.addMemorizedForm.markAsDirty();
    this.recalculateAllocation();
  }

  updateTotalAmount(): void {
    this.recalculateAllocation();
  }

  private recalculateAllocation(): void {
    switch (this.splitMethod()) {
      case 'percentage': this.allocateByPercentage(); break;
      case 'shares': this.allocateByShares(); break;
      default: this.allocateSharedAmounts();
    }
  }

  allocateSharedAmounts(): void {
    const val = this.addMemorizedForm.value;
    const input = {
      totalAmount: val.amount!,
      sharedAmount: val.sharedAmount!,
      allocatedAmount: val.allocatedAmount!,
      splits: this.splitsFormArray.value.map((split: Split) => ({
        owedByMemberRef: split.owedByMemberRef,
        assignedAmount: split.assignedAmount,
        percentage: split.percentage,
        shares: split.shares ?? 0,
        allocatedAmount: split.allocatedAmount,
      })),
    };

    const result = this.allocationUtils.allocateSharedAmounts(input);

    // Update the form with the adjusted shared amount if it changed
    if (result.adjustedSharedAmount !== val.sharedAmount) {
      this.addMemorizedForm.patchValue({
        sharedAmount: result.adjustedSharedAmount,
      });
    }

    // Apply the allocation results to the form array
    this.allocationUtils.applyAllocationToFormArray(
      this.splitsFormArray,
      result
    );
  }

  allocateByPercentage(): void {
    if (this.splitsFormArray.length === 0) return;
    const result = this.allocationUtils.allocateByPercentage({
      totalAmount: +this.addMemorizedForm.value.amount!,
      splits: this.splitsFormArray.getRawValue().map((s: any) => ({
        owedByMemberRef: s.owedByMemberRef,
        assignedAmount: s.assignedAmount,
        percentage: s.percentage,
        shares: s.shares ?? 0,
        allocatedAmount: s.allocatedAmount,
      })),
    });
    this.allocationUtils.applyPercentageAllocationToFormArray(this.splitsFormArray, result);
  }

  allocateByShares(): void {
    if (this.splitsFormArray.length === 0) return;
    const result = this.allocationUtils.allocateByShares({
      totalAmount: +this.addMemorizedForm.value.amount!,
      splits: this.splitsFormArray.getRawValue().map((s: any) => ({
        owedByMemberRef: s.owedByMemberRef,
        assignedAmount: s.assignedAmount,
        percentage: s.percentage,
        shares: s.shares ?? 0,
        allocatedAmount: s.allocatedAmount,
      })),
    });
    this.allocationUtils.applyPercentageAllocationToFormArray(this.splitsFormArray, result);
  }

  protected effectivePercentage(index: number): number {
    const splits = this.splitsFormArray.getRawValue();
    const totalShares = splits.reduce((t: number, s: any) => t + (+s.shares || 0), 0);
    if (totalShares === 0) return 0;
    return ((+splits[index].shares || 0) / totalShares) * 100;
  }

  getAssignedTotal = (): number =>
    this.localeService.roundToCurrency(
      +[...this.splitsFormArray.value].reduce(
        (total, s) =>
          total + this.localeService.roundToCurrency(+s.assignedAmount),
        0
      )
    );

  getAllocatedTotal = (): number =>
    this.localeService.roundToCurrency(
      +[...this.splitsFormArray.value].reduce(
        (total, s) =>
          total + this.localeService.roundToCurrency(+s.allocatedAmount),
        0
      )
    );

  memorizedFullyAllocated = (): boolean =>
    this.addMemorizedForm.value.amount == this.getAllocatedTotal();

  isLastSplit(index: number): boolean {
    return this.splitMethod() === 'percentage' && index === this.splitsFormArray.length - 1;
  }

  async onSubmit(): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    const val = this.addMemorizedForm.getRawValue();
    const memorized: Partial<Memorized> = {
      description: val.description!,
      categoryRef: val.category!,
      paidByMemberRef: val.paidByMember!,
      sharedAmount: +val.sharedAmount!,
      allocatedAmount: +val.allocatedAmount!,
      totalAmount: +val.amount!,
      splitMethod: this.splitMethod(),
    };
    let splits: Partial<Split>[] = [];
    this.splitsFormArray.getRawValue().forEach((s) => {
      const split = {
        assignedAmount: +s.assignedAmount,
        percentage: +s.percentage,
        shares: s.shares ?? 0,
        allocatedAmount: +s.allocatedAmount,
        paidByMemberRef: val.paidByMember!,
        owedByMemberRef: s.owedByMemberRef,
      };
      splits.push(split);
    });
    memorized.splits = splits;
    this.loading.loadingOn();
    try {
      await this.memorizedService.addMemorized(
        this.currentGroup()!.id,
        memorized
      );
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Memorized expense added' },
      });
      this.router.navigate(['/memorized']);
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logError(
          'Add Memorized Component',
          'memorize_expense',
          'Failed to memorize expense',
          error.message
        );
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: {
            message: 'Something went wrong - could not memorize expense',
          },
        });
      }
    } finally {
      this.loading.loadingOff();
    }
  }

  onCancel(): void {
    this.router.navigate(['/memorized']);
  }

  openCalculator(event: Event, controlName: string, index?: number): void {
    const target = event.target as HTMLElement;
    this.calculatorOverlay.openCalculator(target, (result: number) => {
      if (index === undefined) {
        const control = this.addMemorizedForm.get(controlName);
        if (control) {
          control.setValue(this.localeService.roundToCurrency(result), {
            emitEvent: true,
          });
          this.updateTotalAmount();
        }
      } else {
        const control = this.splitsFormArray.at(index).get(controlName);
        if (control) {
          control.setValue(this.localeService.roundToCurrency(result), {
            emitEvent: true,
          });
          this.recalculateAllocation();
        }
      }
    });
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'add-edit-memorized' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }
}
