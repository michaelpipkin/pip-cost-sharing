import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Analytics, logEvent } from '@angular/fire/analytics';
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
import { HelpComponent } from '@components/help/help.component';
import { Category } from '@models/category';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Memorized } from '@models/memorized';
import { Split } from '@models/split';
import { CategoryService } from '@services/category.service';
import { GroupService } from '@services/group.service';
import { MemberService } from '@services/member.service';
import { MemorizedService } from '@services/memorized.service';
import { DeleteDialogComponent } from '@shared/delete-dialog/delete-dialog.component';
import { FormatCurrencyInputDirective } from '@shared/directives/format-currency-input.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { StringUtils } from 'src/app/utilities/string-utils.service';
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
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogConfig,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import {
  Component,
  ElementRef,
  inject,
  Signal,
  afterRender,
  computed,
  afterNextRender,
  viewChildren,
  viewChild,
} from '@angular/core';
@Component({
  selector: 'app-edit-memorized',
  standalone: true,
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
export class EditMemorizedComponent {
  dialogRef = inject(MatDialogRef<EditMemorizedComponent>);
  fb = inject(FormBuilder);
  groupService = inject(GroupService);
  memberService = inject(MemberService);
  categoryService = inject(CategoryService);
  memorizedService = inject(MemorizedService);
  dialog = inject(MatDialog);
  loading = inject(LoadingService);
  snackBar = inject(MatSnackBar);
  analytics = inject(Analytics);
  decimalPipe = inject(DecimalPipe);
  stringUtils = inject(StringUtils);
  data: any = inject(MAT_DIALOG_DATA);

  #currentGroup: Signal<Group> = this.groupService.currentGroup;

  categories = computed<Category[]>(() => {
    return this.categoryService
      .groupCategories()
      .filter((c) => c.active || c.id == this.data.memorized.categoryId);
  });
  memorizedMembers = computed<Member[]>(() => {
    return this.memberService
      .groupMembers()
      .filter((m) => m.active || m.id == this.data.memorized.paidByMemberId);
  });
  splitMembers = computed<Member[]>(() => {
    const splitMemberIds: string[] = this.data.memorized.splits?.map(
      (s: Split) => s.owedByMemberId
    );
    return this.memberService
      .groupMembers()
      .filter((m) => m.active || splitMemberIds.includes(m.id));
  });
  totalAmountField = viewChild<ElementRef>('totalAmount');
  proportionalAmountField = viewChild<ElementRef>('propAmount');
  inputElements = viewChildren<ElementRef>('inputElement');
  memberAmounts = viewChildren<ElementRef>('memberAmount');

  memorized = this.data.memorized;

  editMemorizedForm = this.fb.group({
    paidByMemberId: [this.memorized.paidByMemberId, Validators.required],
    amount: [
      this.memorized.totalAmount,
      [Validators.required, this.amountValidator()],
    ],
    description: [this.memorized.description, Validators.required],
    categoryId: [this.memorized.categoryId, Validators.required],
    sharedAmount: [this.memorized.sharedAmount, Validators.required],
    allocatedAmount: [this.memorized.allocatedAmount, Validators.required],
    splits: this.fb.array(
      this.memorized.splits?.map((s: Split) => {
        return this.fb.group({
          owedByMemberId: [s.owedByMemberId, Validators.required],
          assignedAmount: [s.assignedAmount, Validators.required],
          allocatedAmount: [s.allocatedAmount],
        });
      }),
      [Validators.required, Validators.minLength(1)]
    ),
  });

  constructor() {
    afterNextRender(() => {
      const memorized = this.data.memorized;
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
    return this.fb.group({
      owedByMemberId: ['', Validators.required],
      assignedAmount: ['0.00', Validators.required],
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
    this.allocateSharedAmounts();
  }

  removeSplit(index: number): void {
    this.splitsFormArray.removeAt(index);
    this.allocateSharedAmounts();
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
      if (!this.memorizedFullyAllocated() && splitCount > 0) {
        let diff = +(totalAmount - this.getAllocatedTotal()).toFixed(2);
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
    this.editMemorizedForm.disable();
    const val = this.editMemorizedForm.value;
    const changes: Partial<Memorized> = {
      description: val.description,
      categoryId: val.categoryId,
      paidByMemberId: val.paidByMemberId,
      sharedAmount: val.sharedAmount,
      allocatedAmount: val.allocatedAmount,
      totalAmount: val.amount,
    };
    let splits: Partial<Split>[] = [];
    this.splitsFormArray.value.forEach((s) => {
      const split: Partial<Split> = {
        categoryId: val.categoryId,
        assignedAmount: s.assignedAmount,
        allocatedAmount: s.allocatedAmount,
        paidByMemberId: val.paidByMemberId,
        owedByMemberId: s.owedByMemberId,
      };
      splits.push(split);
    });
    changes.splits = splits;
    this.loading.loadingOn();
    this.memorizedService
      .updateMemorized(this.#currentGroup().id, this.data.memorized.id, changes)
      .then(() => {
        this.dialogRef.close({
          success: true,
          operation: 'edited',
        });
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

  delete(): void {
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
          .deleteMemorized(this.#currentGroup().id, this.data.memorized.id)
          .then(() => {
            this.dialogRef.close({
              success: true,
              operation: 'deleted',
            });
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

  showHelp(): void {
    const dialogConfig: MatDialogConfig = {
      data: {
        page: 'add-edit-memorized',
        title: 'Memorized Expense Help',
      },
      disableClose: false,
      maxWidth: '80vw',
    };
    this.dialog.open(HelpComponent, dialogConfig);
  }
}
