import { DecimalPipe } from '@angular/common';
import {
  afterEveryRender,
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
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
import { ActivatedRoute, Router } from '@angular/router';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { DeleteDialogComponent } from '@components/delete-dialog/delete-dialog.component';
import { LoadingService } from '@components/loading/loading.service';
import { SplitMethodToggleComponent } from '@components/split-method-toggle/split-method-toggle.component';
import { DocRefCompareDirective } from '@directives/doc-ref-compare.directive';
import { FormatCurrencyInputDirective } from '@directives/format-currency-input.directive';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@features/help/help-dialog/help-dialog.component';
import { Category } from '@models/category';
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

@Component({
  selector: 'app-edit-memorized',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatInputModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatIconModule,
    MatTableModule,
    DecimalPipe,
    CurrencyPipe,
    FormatCurrencyInputDirective,
    DocRefCompareDirective,
    SplitMethodToggleComponent,
  ],
  templateUrl: './edit-memorized.component.html',
  styleUrl: './edit-memorized.component.scss',
})
export class EditMemorizedComponent {
  protected readonly fb = inject(FormBuilder);
  protected readonly router = inject(Router);
  protected readonly route = inject(ActivatedRoute);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly categoryService = inject(CategoryService);
  protected readonly demoService = inject(DemoService);
  protected readonly memorizedService = inject(MemorizedService);
  protected readonly dialog = inject(MatDialog);
  protected readonly loading = inject(LoadingService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly analytics = inject(AnalyticsService);
  protected readonly decimalPipe = inject(DecimalPipe);
  protected readonly stringUtils = inject(StringUtils);
  protected readonly allocationUtils = inject(AllocationUtilsService);
  protected readonly calculatorOverlay = inject(CalculatorOverlayService);
  protected readonly localeService = inject(LocaleService);

  splitMethod = signal<SplitMethod>('amount');

  memorized = signal<Memorized>(this.route.snapshot.data.memorized);

  categories = computed<Category[]>(() => {
    return this.categoryStore
      .groupCategories()
      .filter((c) => c.active || c.ref!.eq(this.memorized().categoryRef));
  });
  memorizedMembers = computed<Member[]>(() => {
    return this.memberStore
      .groupMembers()
      .filter((m) => m.active || m.ref!.eq(this.memorized().paidByMemberRef));
  });
  splitMembers = computed<Member[]>(() => {
    const splitMembers: DocumentReference<Member>[] =
      this.memorized().splits?.map((s: Partial<Split>) => s.owedByMemberRef!) ??
      [];
    return this.memberStore
      .groupMembers()
      .filter((m) => m.active || splitMembers.includes(m.ref!)); // NOSONAR
  });

  totalAmountField = viewChild<ElementRef>('totalAmount');
  proportionalAmountField = viewChild<ElementRef>('propAmount');
  inputElements = viewChildren<ElementRef>('inputElement');
  memberAmounts = viewChildren<ElementRef>('memberAmount');

  editMemorizedForm = this.fb.group({
    paidByMember: [
      null as unknown as DocumentReference<Member>,
      Validators.required,
    ],
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

  constructor() {
    // Load memorized data from route and populate form
    const memorized = this.memorized();
    this.splitMethod.set(memorized.splitMethod);
    this.editMemorizedForm.patchValue({
      paidByMember: memorized.paidByMemberRef,
      amount: memorized.totalAmount,
      description: memorized.description,
      category: memorized.categoryRef,
      sharedAmount: memorized.sharedAmount,
      allocatedAmount: memorized.allocatedAmount,
    });
    memorized.splits.forEach((s: Partial<Split>) => {
      this.splits.push(
        this.fb.group({
          owedByMemberRef: s.owedByMemberRef,
          assignedAmount: s.assignedAmount,
          percentage: s.percentage,
          shares: s.shares ?? 0,
          allocatedAmount: s.allocatedAmount,
        })
      );
    });

    afterNextRender(() => {
      const memorized = this.memorized();
      this.totalAmountField()!.nativeElement.value =
        this.decimalPipe.transform(memorized.totalAmount, '1.2-2') || '0.00';
      this.proportionalAmountField()!.nativeElement.value =
        this.decimalPipe.transform(memorized.allocatedAmount, '1.2-2') ||
        '0.00';
      this.memberAmounts().forEach((elementRef: ElementRef, index: number) => {
        elementRef.nativeElement.value =
          this.decimalPipe.transform(
            memorized.splits[index]!.assignedAmount,
            '1.2-2'
          ) || '0.00';
      });
      this.loading.loadingOff();
    });
    afterEveryRender(() => {
      this.addSelectFocus();
    });
  }

  get splits(): FormArray {
    return this.editMemorizedForm.get('splits') as FormArray;
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
    const availableMembers = this.memorizedMembers().filter(
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
    return this.editMemorizedForm.controls;
  }

  get splitsFormArray(): FormArray {
    return this.editMemorizedForm.get('splits') as FormArray;
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
    this.editMemorizedForm.markAsDirty();
  }

  availableMembersForSplit(index: number): Member[] {
    const selectedMemberIds = new Set(
      this.splitsFormArray.controls
        .filter((_, i) => i !== index)
        .map((c) => c.get('owedByMemberRef')!.value)
        .filter((ref) => ref !== null)
        .map((ref) => ref.id)
    );
    return this.splitMembers().filter(
      (member) => !selectedMemberIds.has(member.id)
    );
  }

  removeSplit(index: number): void {
    this.splitsFormArray.removeAt(index);
    this.recalculateAllocation();
    this.editMemorizedForm.markAsDirty();
  }

  onSplitMethodChange(): void {
    this.editMemorizedForm.markAsDirty();
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
    const val = this.editMemorizedForm.value;
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
      this.editMemorizedForm.patchValue({
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
      totalAmount: +this.editMemorizedForm.value.amount!,
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
      totalAmount: +this.editMemorizedForm.value.amount!,
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
    this.editMemorizedForm.value.amount == this.getAllocatedTotal();

  isLastSplit(index: number): boolean {
    return this.splitMethod() === 'percentage' && index === this.splitsFormArray.length - 1;
  }

  async onSubmit(): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    try {
      this.loading.loadingOn();
      const val = this.editMemorizedForm.getRawValue();
      const changes: Partial<Memorized> = {
        description: val.description!,
        categoryRef: val.category!,
        paidByMemberRef: val.paidByMember!,
        sharedAmount: val.sharedAmount!,
        allocatedAmount: val.allocatedAmount!,
        totalAmount: val.amount!,
        splitMethod: this.splitMethod(),
      };
      let splits: Partial<Split>[] = [];
      this.splitsFormArray.getRawValue().forEach((s) => {
        const split = {
          assignedAmount: s.assignedAmount,
          percentage: s.percentage,
          shares: s.shares ?? 0,
          allocatedAmount: s.allocatedAmount,
          paidByMemberRef: val.paidByMember!,
          owedByMemberRef: s.owedByMemberRef,
        };
        splits.push(split);
      });
      changes.splits = splits;
      await this.memorizedService.updateMemorized(
        this.memorized().ref!, // NOSONAR
        changes
      );
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: { message: 'Memorized expense updated' },
      });
      this.router.navigate(['/memorized']);
    } catch (error) {
      if (error instanceof Error) {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: { message: error.message },
        });
        this.analytics.logError(
          'Edit Memorized Component',
          'edit_memorized_expense',
          'Failed to update memorized expense',
          error.message
        );
      } else {
        this.snackbar.openFromComponent(CustomSnackbarComponent, {
          data: {
            message:
              'Something went wrong - could not update memorized expense',
          },
        });
      }
    } finally {
      this.loading.loadingOff();
    }
  }

  onDelete(): void {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      return;
    }
    const dialogConfig: MatDialogConfig = {
      data: {
        operation: 'Delete',
        target: `this memorized expense`,
      },
    };
    const dialogRef = this.dialog.open(DeleteDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(async (confirm) => {
      if (confirm) {
        try {
          this.loading.loadingOn();
          await this.memorizedService.deleteMemorized(this.memorized().ref!); // NOSONAR
          this.snackbar.openFromComponent(CustomSnackbarComponent, {
            data: { message: 'Memorized expense deleted' },
          });
          this.router.navigate(['/memorized']);
        } catch (error) {
          if (error instanceof Error) {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: { message: error.message },
            });
            this.analytics.logError(
              'Edit Memorized Component',
              'delete_memorized_expense',
              'Failed to delete memorized expense',
              error.message
            );
          } else {
            this.snackbar.openFromComponent(CustomSnackbarComponent, {
              data: {
                message:
                  'Something went wrong - could not delete memorized expense',
              },
            });
          }
        } finally {
          this.loading.loadingOff();
        }
      }
    });
  }

  onCancel(): void {
    this.router.navigate(['/memorized']);
  }

  openCalculator(event: Event, controlName: string, index?: number): void {
    const target = event.target as HTMLElement;
    this.calculatorOverlay.openCalculator(target, (result: number) => {
      if (index === undefined) {
        const control = this.editMemorizedForm.get(controlName);
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
