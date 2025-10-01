import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Memorized } from '@models/memorized';
import { Split } from '@models/split';
import { CategoryService } from '@services/category.service';
import { MemorizedService } from '@services/memorized.service';
import { DocRefCompareDirective } from '@shared/directives/doc-ref-compare.directive';
import { FormatCurrencyInputDirective } from '@shared/directives/format-currency-input.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { CalculatorOverlayService } from '@shared/services/calculator-overlay.service';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { AllocationUtilsService } from '@utils/allocation-utils.service';
import { StringUtils } from '@utils/string-utils.service';
import { DateUtils } from '@utils/date-utils.service';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { DocumentReference } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import {
  afterEveryRender,
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  model,
  OnInit,
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
import {
  MatDialog,
  MatDialogConfig,
  MatDialogModule,
} from '@angular/material/dialog';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@components/help/help-dialog/help-dialog.component';

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
    CurrencyPipe,
    FormatCurrencyInputDirective,
    DocRefCompareDirective,
  ],
})
export class AddMemorizedComponent implements OnInit {
  protected readonly storage = inject(getStorage);
  protected readonly analytics = inject(getAnalytics);
  protected readonly dialog = inject(MatDialog);
  protected readonly router = inject(Router);
  protected readonly fb = inject(FormBuilder);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly categoryService = inject(CategoryService);
  protected readonly memorizedService = inject(MemorizedService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly decimalPipe = inject(DecimalPipe);
  protected readonly stringUtils = inject(StringUtils);
  protected readonly allocationUtils = inject(AllocationUtilsService);
  protected readonly calculatorOverlay = inject(CalculatorOverlayService);

  currentMember: Signal<Member> = this.memberStore.currentMember;
  currentGroup: Signal<Group> = this.groupStore.currentGroup;
  activeMembers: Signal<Member[]> = this.memberStore.activeGroupMembers;
  #categories: Signal<Category[]> = this.categoryStore.groupCategories;

  activeCategories = computed<Category[]>(() => {
    return this.#categories().filter((c) => c.active);
  });

  splitByPercentage = model<boolean>(false);

  totalAmountField = viewChild<ElementRef>('totalAmount');
  allocatedAmountField = viewChild<ElementRef>('propAmount');
  inputElements = viewChildren<ElementRef>('inputElement');
  memberAmounts = viewChildren<ElementRef>('memberAmount');

  addMemorizedForm = this.fb.group({
    paidByMember: [this.currentMember()?.ref, Validators.required],
    date: [new Date(), Validators.required],
    amount: [0, [Validators.required, this.amountValidator()]],
    description: ['', Validators.required],
    category: [null as DocumentReference<Category>, Validators.required],
    sharedAmount: [0.0, Validators.required],
    allocatedAmount: [0, Validators.required],
    splits: this.fb.array([], [Validators.required, Validators.minLength(1)]),
  });

  constructor() {
    afterNextRender(() => {
      this.totalAmountField().nativeElement.value = '0.00';
      this.allocatedAmountField().nativeElement.value = '0.00';
      this.memberAmounts().forEach((elementRef: ElementRef) => {
        elementRef.nativeElement.value = '0.00';
      });
    });
    afterEveryRender(() => {
      this.addSelectFocus();
    });
  }

  ngOnInit(): void {
    if (this.activeCategories().length == 1) {
      this.addMemorizedForm.patchValue({
        category: this.activeCategories()[0].ref,
      });
    }
    if (this.currentGroup().autoAddMembers) {
      this.addAllActiveGroupMembers();
    }
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
    const availableMembers = this.activeMembers().filter(
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
  }

  addAllActiveGroupMembers(): void {
    const existingMembers = this.splitsFormArray.controls.map(
      (control) => control.get('owedByMemberRef').value.id
    );

    this.activeMembers().forEach((member: Member) => {
      if (!existingMembers.includes(member.id)) {
        this.splitsFormArray.push(
          this.fb.group({
            owedByMemberRef: [member.ref, Validators.required],
            assignedAmount: ['0.00', Validators.required],
            percentage: [0.0],
            allocatedAmount: [0.0],
          })
        );
      }
    });
    setTimeout(() => {
      const newInputs = this.memberAmounts().filter(
        (i) => i.nativeElement.value === ''
      );
      newInputs.forEach((input) => {
        input.nativeElement.value = '0.00';
        // Manually trigger the input event to update the mat-label
        const event = new Event('input', { bubbles: true });
        input.nativeElement.dispatchEvent(event);
      });
    });
    if (this.splitByPercentage()) {
      this.allocateByPercentage();
    } else {
      this.allocateSharedAmounts();
    }
  }

  removeSplit(index: number): void {
    this.splitsFormArray.removeAt(index);
    if (this.splitByPercentage()) {
      this.allocateByPercentage();
    } else {
      this.allocateSharedAmounts();
    }
  }

  toggleSplitByPercentage(): void {
    this.splitByPercentage.set(!this.splitByPercentage());
    this.addMemorizedForm.markAsDirty();
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
    if (this.splitsFormArray.length === 0) {
      return;
    }

    const val = this.addMemorizedForm.value;
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
      const val = this.addMemorizedForm.value;
      const totalAmount: number = val.amount;
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
    this.addMemorizedForm.value.amount == this.getAllocatedTotal();

  async onSubmit(): Promise<void> {
    const val = this.addMemorizedForm.value;
    const memorized: Partial<Memorized> = {
      description: val.description,
      categoryRef: val.category,
      paidByMemberRef: val.paidByMember,
      sharedAmount: +val.sharedAmount,
      allocatedAmount: +val.allocatedAmount,
      totalAmount: +val.amount,
      splitByPercentage: this.splitByPercentage(),
    };
    let splits = [];
    this.splitsFormArray.value.forEach((s) => {
      const split = {
        assignedAmount: +s.assignedAmount,
        percentage: +s.percentage,
        allocatedAmount: +s.allocatedAmount,
        paidByMemberRef: val.paidByMember,
        owedByMemberRef: s.owedByMemberRef,
      };
      splits.push(split);
    });
    memorized.splits = splits;
    this.loading.loadingOn();
    try {
      await this.memorizedService.addMemorized(
        this.currentGroup().id,
        memorized
      );
      this.snackBar.open('Memorized expense added.', 'OK');
      this.router.navigate(['/memorized']);
    } catch (error) {
      if (error instanceof Error) {
        this.snackBar.open(error.message, 'Close');
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'memorize_expense',
          message: error.message,
        });
      } else {
        this.snackBar.open(
          'Something went wrong - could not memorize expense.',
          'Close'
        );
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
        const control = this.addMemorizedForm.get(controlName);
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
