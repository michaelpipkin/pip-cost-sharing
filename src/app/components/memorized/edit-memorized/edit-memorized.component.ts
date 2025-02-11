import { CurrencyPipe, DecimalPipe } from '@angular/common';
import {
  afterNextRender,
  afterRender,
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
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Memorized } from '@models/memorized';
import { Split } from '@models/split';
import { MemorizedService } from '@services/memorized.service';
import { DeleteDialogComponent } from '@shared/delete-dialog/delete-dialog.component';
import { FormatCurrencyInputDirective } from '@shared/directives/format-currency-input.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { StringUtils } from 'src/app/utilities/string-utils.service';
import { AddEditMemorizedHelpComponent } from '../add-edit-memorized-help/add-edit-memorized-help.component';
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
  protected readonly memorizedService = inject(MemorizedService);
  protected readonly dialog = inject(MatDialog);
  protected readonly loading = inject(LoadingService);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly analytics = inject(getAnalytics);
  protected readonly decimalPipe = inject(DecimalPipe);
  protected readonly stringUtils = inject(StringUtils);

  #currentGroup: Signal<Group> = this.groupStore.currentGroup;

  memorized = signal<Memorized>(null);

  categories = computed<Category[]>(() => {
    return this.categoryStore
      .groupCategories()
      .filter((c) => c.active || c.id == this.memorized().categoryId);
  });
  memorizedMembers = computed<Member[]>(() => {
    return this.memberStore
      .groupMembers()
      .filter((m) => m.active || m.id == this.memorized().paidByMemberId);
  });
  splitMembers = computed<Member[]>(() => {
    const splitMemberIds: string[] = this.memorized().splits?.map(
      (s: Split) => s.owedByMemberId
    );
    return this.memberStore
      .groupMembers()
      .filter((m) => m.active || splitMemberIds.includes(m.id));
  });

  splitByPercentage = model<boolean>(false);

  totalAmountField = viewChild<ElementRef>('totalAmount');
  proportionalAmountField = viewChild<ElementRef>('propAmount');
  inputElements = viewChildren<ElementRef>('inputElement');
  memberAmounts = viewChildren<ElementRef>('memberAmount');

  editMemorizedForm = this.fb.group({
    paidByMemberId: ['', Validators.required],
    amount: [0, [Validators.required, this.amountValidator()]],
    description: ['', Validators.required],
    categoryId: ['', Validators.required],
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
    afterRender(() => {
      this.addSelectFocus();
    });
  }

  ngOnInit(): void {
    const memorized = this.route.snapshot.data.memorized;
    this.memorized.set(memorized);
    this.splitByPercentage.set(memorized.splitByPercentage);
    this.editMemorizedForm.patchValue({
      paidByMemberId: memorized.paidByMemberId,
      amount: memorized.totalAmount,
      description: memorized.description,
      categoryId: memorized.categoryId,
      sharedAmount: memorized.sharedAmount,
      allocatedAmount: memorized.allocatedAmount,
    });
    memorized.splits.forEach((s: Split) => {
      this.splits.push(
        this.fb.group({
          owedByMemberId: s.owedByMemberId,
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
    const existingMemberIds = this.splitsFormArray.controls.map(
      (control) => control.get('owedByMemberId').value
    );
    const availableMembers = this.memorizedMembers().filter(
      (m) => !existingMemberIds.includes(m.id)
    );
    return this.fb.group({
      owedByMemberId: [
        availableMembers.length > 0 ? availableMembers[0].id : '',
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
    if (this.splitsFormArray.length > 0) {
      let splits: Split[] = [...this.splitsFormArray.value];
      for (let i = 0; i < splits.length; ) {
        if (!splits[i].owedByMemberId && splits[i].assignedAmount === 0) {
          splits.splice(i, 1);
        } else {
          i++;
        }
      }
      const splitCount: number = splits.filter(
        (s) => s.owedByMemberId !== ''
      ).length;
      const splitTotal: number = this.getAssignedTotal();
      const val = this.editMemorizedForm.value;
      const totalAmount: number = val.amount;
      let sharedAmount: number = val.sharedAmount;
      const allocatedAmount: number = val.allocatedAmount;
      const totalSharedSplits: number = +(
        sharedAmount +
        allocatedAmount +
        splitTotal
      ).toFixed(2);
      if (totalAmount != totalSharedSplits) {
        sharedAmount = +(totalAmount - splitTotal - allocatedAmount).toFixed(2);
        this.editMemorizedForm.patchValue({
          sharedAmount: sharedAmount,
        });
      }
      // First, split the shared amount equally among all splits
      splits.forEach((split: Split) => {
        split.allocatedAmount = +(sharedAmount / splitCount).toFixed(2);
      });
      splits.forEach((split: Split) => {
        if (splitTotal == 0) {
          split.allocatedAmount += +(allocatedAmount / splitCount).toFixed(2);
        } else {
          split.allocatedAmount = +(
            +split.assignedAmount +
            +split.allocatedAmount +
            (+split.assignedAmount / splitTotal) * allocatedAmount
          ).toFixed(2);
        }
      });
      const allocatedTotal = +splits
        .reduce((total, s) => (total += s.allocatedAmount), 0)
        .toFixed(2);
      if (allocatedTotal !== totalAmount && splitCount > 0) {
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

  allocateByPercentage(): void {
    var totalPercentage: number = 0;
    if (this.splitsFormArray.length > 0) {
      let splits: Split[] = [...this.splitsFormArray.value];
      for (let i = 0; i < splits.length; ) {
        if (!splits[i].owedByMemberId && splits[i].assignedAmount === 0) {
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
        (s) => s.owedByMemberId !== ''
      ).length;
      const val = this.editMemorizedForm.value;
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
    this.editMemorizedForm.value.amount == this.getAllocatedTotal();

  onSubmit(): void {
    this.loading.loadingOn();
    this.editMemorizedForm.disable();
    const val = this.editMemorizedForm.value;
    const changes: Partial<Memorized> = {
      description: val.description,
      categoryId: val.categoryId,
      paidByMemberId: val.paidByMemberId,
      sharedAmount: val.sharedAmount,
      allocatedAmount: val.allocatedAmount,
      totalAmount: val.amount,
      splitByPercentage: this.splitByPercentage(),
    };
    let splits: Partial<Split>[] = [];
    this.splitsFormArray.value.forEach((s) => {
      const split: Partial<Split> = {
        categoryId: val.categoryId,
        assignedAmount: s.assignedAmount,
        percentage: s.percentage,
        allocatedAmount: s.allocatedAmount,
        paidByMemberId: val.paidByMemberId,
        owedByMemberId: s.owedByMemberId,
      };
      splits.push(split);
    });
    changes.splits = splits;
    this.loading.loadingOn();
    this.memorizedService
      .updateMemorized(this.#currentGroup().id, this.memorized().id, changes)
      .then(() => {
        this.snackBar.open('Memorized expense updated.', 'OK');
        this.router.navigate(['/memorized']);
      })
      .catch((err: Error) => {
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'edit_memorized_expense',
          message: err.message,
        });
        this.snackBar.open(
          'Something went wrong - could not update memorized expense.',
          'Close'
        );
        this.editMemorizedForm.enable();
      })
      .finally(() => this.loading.loadingOff());
  }

  onDelete(): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        operation: 'Delete',
        target: `this memorized expense`,
      },
    };
    const dialogRef = this.dialog.open(DeleteDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe((confirm) => {
      if (confirm) {
        this.loading.loadingOn();
        this.memorizedService
          .deleteMemorized(this.#currentGroup().id, this.memorized().id)
          .then(() => {
            this.snackBar.open('Memorized expense deleted.', 'OK');
            this.router.navigate(['/memorized']);
          })
          .catch((err: Error) => {
            logEvent(this.analytics, 'error', {
              component: this.constructor.name,
              action: 'delete_memorized_expense',
              message: err.message,
            });
            this.snackBar.open(
              'Something went wrong - could not delete memorized expense.',
              'Close'
            );
          })
          .finally(() => this.loading.loadingOff());
      }
    });
  }

  onCancel(): void {
    this.router.navigate(['/memorized']);
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig = {
      disableClose: false,
      maxWidth: '80vw',
    };
    this.dialog.open(AddEditMemorizedHelpComponent, dialogConfig);
  }
}
