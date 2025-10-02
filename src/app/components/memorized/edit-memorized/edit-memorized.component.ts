import { CurrencyPipe, DecimalPipe } from '@angular/common';
import {
  afterEveryRender,
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  model,
  OnInit,
  signal,
  Signal,
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
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@components/help/help-dialog/help-dialog.component';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Memorized } from '@models/memorized';
import { Split } from '@models/split';
import { CategoryService } from '@services/category.service';
import { MemorizedService } from '@services/memorized.service';
import { DeleteDialogComponent } from '@shared/delete-dialog/delete-dialog.component';
import { DocRefCompareDirective } from '@shared/directives/doc-ref-compare.directive';
import { FormatCurrencyInputDirective } from '@shared/directives/format-currency-input.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { CalculatorOverlayService } from '@shared/services/calculator-overlay.service';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { AllocationUtilsService } from '@utils/allocation-utils.service';
import { StringUtils } from '@utils/string-utils.service';
import { getAnalytics, logEvent } from 'firebase/analytics';
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
    CurrencyPipe,
    FormatCurrencyInputDirective,
    DocRefCompareDirective,
  ],
  templateUrl: './edit-memorized.component.html',
  styleUrl: './edit-memorized.component.scss',
})
export class EditMemorizedComponent implements OnInit {
  protected readonly fb = inject(FormBuilder);
  protected readonly router = inject(Router);
  protected readonly route = inject(ActivatedRoute);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly categoryService = inject(CategoryService);
  protected readonly memorizedService = inject(MemorizedService);
  protected readonly dialog = inject(MatDialog);
  protected readonly loading = inject(LoadingService);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);
  protected readonly decimalPipe = inject(DecimalPipe);
  protected readonly stringUtils = inject(StringUtils);
  protected readonly allocationUtils = inject(AllocationUtilsService);
  protected readonly calculatorOverlay = inject(CalculatorOverlayService);

  #currentGroup: Signal<Group> = this.groupStore.currentGroup;

  memorized = signal<Memorized>(null);

  categories = computed<Category[]>(() => {
    return this.categoryStore
      .groupCategories()
      .filter((c) => c.active || c.ref.eq(this.memorized().categoryRef));
  });
  memorizedMembers = computed<Member[]>(() => {
    return this.memberStore
      .groupMembers()
      .filter((m) => m.active || m.ref.eq(this.memorized().paidByMemberRef));
  });
  splitMembers = computed<Member[]>(() => {
    const splitMembers: DocumentReference<Member>[] =
      this.memorized().splits?.map((s: Split) => s.owedByMemberRef);
    return this.memberStore
      .groupMembers()
      .filter((m) => m.active || splitMembers.includes(m.ref));
  });

  splitByPercentage = model<boolean>(false);

  totalAmountField = viewChild<ElementRef>('totalAmount');
  proportionalAmountField = viewChild<ElementRef>('propAmount');
  inputElements = viewChildren<ElementRef>('inputElement');
  memberAmounts = viewChildren<ElementRef>('memberAmount');

  editMemorizedForm = this.fb.group({
    paidByMember: [null as DocumentReference<Member>, Validators.required],
    amount: [0, [Validators.required, this.amountValidator()]],
    description: ['', Validators.required],
    category: [null as DocumentReference<Category>, Validators.required],
    sharedAmount: [0, Validators.required],
    allocatedAmount: [0, Validators.required],
    splits: this.fb.array([], [Validators.required, Validators.minLength(1)]),
  });

  constructor() {
    afterNextRender(() => {
      const memorized = this.memorized();
      this.totalAmountField().nativeElement.value =
        this.decimalPipe.transform(memorized.totalAmount, '1.2-2') || '0.00';
      this.proportionalAmountField().nativeElement.value =
        this.decimalPipe.transform(memorized.allocatedAmount, '1.2-2') ||
        '0.00';
      this.memberAmounts().forEach((elementRef: ElementRef, index: number) => {
        elementRef.nativeElement.value =
          this.decimalPipe.transform(
            memorized.splits[index].assignedAmount,
            '1.2-2'
          ) || '0.00';
      });
    });
    afterEveryRender(() => {
      this.addSelectFocus();
    });
  }

  ngOnInit(): void {
    const memorized = this.route.snapshot.data.memorized;
    this.memorized.set(memorized);
    this.splitByPercentage.set(memorized.splitByPercentage);
    this.editMemorizedForm.patchValue({
      paidByMember: memorized.paidByMemberRef,
      amount: memorized.totalAmount,
      description: memorized.description,
      category: memorized.categoryRef,
      sharedAmount: memorized.sharedAmount,
      allocatedAmount: memorized.allocatedAmount,
    });
    memorized.splits.forEach((s: Split) => {
      this.splits.push(
        this.fb.group({
          owedByMemberRef: s.owedByMemberRef,
          assignedAmount: s.assignedAmount,
          percentage: s.percentage,
          allocatedAmount: s.allocatedAmount,
        })
      );
    });
    this.loading.loadingOff();
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
    const existingMembers = this.splitsFormArray.controls.map(
      (control) => control.get('owedByMemberRef').value.id
    );
    const availableMembers = this.memorizedMembers().filter(
      (m) => !existingMembers.includes(m.id)
    );
    return this.fb.group({
      owedByMemberRef: [
        availableMembers.length > 0 ? availableMembers[0].ref : null,
        Validators.required,
      ],
      assignedAmount: ['0.00', Validators.required],
      percentage: [0.0],
      allocatedAmount: [0.0],
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
        lastInput.nativeElement.value = '0.00';
        // Manually trigger the input event to update the mat-label
        const event = new Event('input', { bubbles: true });
        lastInput.nativeElement.dispatchEvent(event);
      }
    });
    if (this.splitByPercentage()) {
      this.allocateByPercentage();
    } else {
      this.allocateSharedAmounts();
    }
    this.editMemorizedForm.markAsDirty();
  }

  removeSplit(index: number): void {
    this.splitsFormArray.removeAt(index);
    if (this.splitByPercentage()) {
      this.allocateByPercentage();
    } else {
      this.allocateSharedAmounts();
    }
    this.editMemorizedForm.markAsDirty();
  }

  toggleSplitByPercentage(): void {
    this.splitByPercentage.set(!this.splitByPercentage());
    this.editMemorizedForm.markAsDirty();
    if (this.splitByPercentage()) {
      this.allocateByPercentage();
    } else {
      this.allocateSharedAmounts();
    }
  }

  updateTotalAmount(): void {
    if (this.splitByPercentage()) {
      this.allocateByPercentage();
    } else {
      this.allocateSharedAmounts();
    }
  }

  allocateSharedAmounts(): void {
    const val = this.editMemorizedForm.value;
    const input = {
      totalAmount: val.amount,
      sharedAmount: val.sharedAmount,
      allocatedAmount: val.allocatedAmount,
      splits: this.splitsFormArray.value.map((split) => ({
        owedByMemberRef: split.owedByMemberRef,
        assignedAmount: split.assignedAmount,
        percentage: split.percentage,
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
    var totalPercentage: number = 0;
    if (this.splitsFormArray.length > 0) {
      let splits = [...this.splitsFormArray.value];
      for (let i = 0; i < splits.length; ) {
        if (!splits[i].owedByMemberRef && splits[i].assignedAmount === 0) {
          splits.splice(i, 1);
        } else {
          if (i < splits.length - 1) {
            splits[i].percentage = +splits[i].percentage;
            totalPercentage += splits[i].percentage;
          } else {
            const remainingPercentage: number = +(
              100 - totalPercentage
            ).toFixed(2);
            splits[i].percentage = remainingPercentage;
            this.splitsFormArray.at(i).patchValue({
              percentage: remainingPercentage,
            });
          }
          i++;
        }
      }
      const splitCount: number = splits.filter(
        (s) => s.owedByMemberRef !== null
      ).length;
      const val = this.editMemorizedForm.value;
      const totalAmount: number = +val.amount;
      splits.forEach((split: Split) => {
        split.allocatedAmount = +(
          (totalAmount * +split.percentage) /
          100
        ).toFixed(2);
      });
      const allocatedTotal: number = +splits
        .reduce((total, s) => (total += s.allocatedAmount), 0)
        .toFixed(2);
      const percentageTotal: number = +splits
        .reduce((total, s) => (total += s.percentage), 0)
        .toFixed(2);
      if (
        allocatedTotal !== totalAmount &&
        percentageTotal === 100 &&
        splitCount > 0
      ) {
        let diff = +(totalAmount - allocatedTotal).toFixed(2);
        for (let i = 0; diff != 0; ) {
          if (diff > 0) {
            splits[i].allocatedAmount += 0.01;
            diff = +(diff - 0.01).toFixed(2);
          } else {
            splits[i].allocatedAmount -= 0.01;
            diff = +(diff + 0.01).toFixed(2);
          }
          if (i < splits.length - 1) {
            i++;
          } else {
            i = 0;
          }
        }
      }
      // Patch the allocatedAmount back into the form array
      splits.forEach((split, index) => {
        this.splitsFormArray.at(index).patchValue({
          allocatedAmount: split.allocatedAmount,
        });
      });
    }
  }

  getAssignedTotal = (): number =>
    +[...this.splitsFormArray.value]
      .reduce((total, s) => (total += +s.assignedAmount), 0)
      .toFixed(2);

  getAllocatedTotal = (): number =>
    +[...this.splitsFormArray.value]
      .reduce((total, s) => (total += +s.allocatedAmount), 0)
      .toFixed(2);

  memorizedFullyAllocated = (): boolean =>
    this.editMemorizedForm.value.amount == this.getAllocatedTotal();

  async onSubmit(): Promise<void> {
    try {
      this.loading.loadingOn();
      const val = this.editMemorizedForm.value;
      const changes: Partial<Memorized> = {
        description: val.description,
        categoryRef: val.category,
        paidByMemberRef: val.paidByMember,
        sharedAmount: val.sharedAmount,
        allocatedAmount: val.allocatedAmount,
        totalAmount: val.amount,
        splitByPercentage: this.splitByPercentage(),
      };
      let splits = [];
      this.splitsFormArray.value.forEach((s) => {
        const split = {
          assignedAmount: s.assignedAmount,
          percentage: s.percentage,
          allocatedAmount: s.allocatedAmount,
          paidByMemberRef: val.paidByMember,
          owedByMemberRef: s.owedByMemberRef,
        };
        splits.push(split);
      });
      changes.splits = splits;
      await this.memorizedService.updateMemorized(
        this.memorized().ref,
        changes
      );
      this.snackBar.open('Memorized expense updated.', 'OK');
      this.router.navigate(['/memorized']);
    } catch (error) {
      if (error instanceof Error) {
        this.snackBar.open(error.message, 'Close');
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'edit_memorized_expense',
          message: error.message,
        });
      } else {
        this.snackBar.open(
          'Something went wrong - could not update memorized expense.',
          'Close'
        );
      }
    } finally {
      this.loading.loadingOff();
    }
  }

  onDelete(): void {
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
          await this.memorizedService.deleteMemorized(this.memorized().ref);
          this.snackBar.open('Memorized expense deleted.', 'OK');
          this.router.navigate(['/memorized']);
        } catch (error) {
          if (error instanceof Error) {
            this.snackBar.open(error.message, 'Close');
            logEvent(this.analytics, 'error', {
              component: this.constructor.name,
              action: 'delete_memorized_expense',
              message: error.message,
            });
          } else {
            this.snackBar.open(
              'Something went wrong - could not delete memorized expense.',
              'Close'
            );
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
      if (index !== undefined) {
        const control = this.splitsFormArray.at(index).get(controlName);
        if (control) {
          control.setValue(result.toFixed(2), { emitEvent: true });
          if (this.splitByPercentage()) {
            this.allocateByPercentage();
          } else {
            this.allocateSharedAmounts();
          }
        }
      } else {
        const control = this.editMemorizedForm.get(controlName);
        if (control) {
          control.setValue(result.toFixed(2), { emitEvent: true });
          this.updateTotalAmount();
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
