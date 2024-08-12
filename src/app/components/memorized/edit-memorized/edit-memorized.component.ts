import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { MatMiniFabButton } from '@angular/material/button';
import { MatOption } from '@angular/material/core';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSelect } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltip } from '@angular/material/tooltip';
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
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import {
  MatDatepicker,
  MatDatepickerInput,
  MatDatepickerToggle,
} from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogActions,
  MatDialogClose,
  MatDialogConfig,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import {
  MatError,
  MatFormField,
  MatHint,
  MatLabel,
  MatPrefix,
  MatSuffix,
} from '@angular/material/form-field';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
  MatHeaderCell,
  MatHeaderCellDef,
  MatHeaderRow,
  MatHeaderRowDef,
  MatNoDataRow,
  MatRow,
  MatRowDef,
  MatTable,
} from '@angular/material/table';
import {
  Component,
  ElementRef,
  inject,
  Signal,
  model,
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
    FormatCurrencyInputDirective,
    MatDialogTitle,
    MatDialogContent,
    FormsModule,
    ReactiveFormsModule,
    MatFormField,
    MatLabel,
    MatSelect,
    MatOption,
    MatError,
    MatInput,
    MatTooltip,
    MatDatepickerInput,
    MatHint,
    MatDatepickerToggle,
    MatSuffix,
    MatDatepicker,
    MatPrefix,
    MatMiniFabButton,
    MatIcon,
    MatTable,
    MatColumnDef,
    MatHeaderCellDef,
    MatHeaderCell,
    MatCellDef,
    MatCell,
    MatHeaderRowDef,
    MatHeaderRow,
    MatRowDef,
    MatRow,
    MatNoDataRow,
    MatDialogActions,
    MatDialogClose,
    CurrencyPipe,
    DecimalPipe,
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

  editMemorizedForm: FormGroup;
  splitForm: FormArray;

  splitsDataSource = model<Split[]>([]);

  splitsTable = viewChild<MatTable<Split>>('splitsTable');
  totalAmountField = viewChild<ElementRef>('totalAmount');
  proportionalAmountField = viewChild<ElementRef>('propAmount');
  inputElements = viewChildren<ElementRef>('inputElement');

  constructor() {
    const memorized: Memorized = this.data.memorized;
    this.editMemorizedForm = this.fb.group({
      paidByMemberId: [memorized.paidByMemberId, Validators.required],
      amount: [
        memorized.totalAmount,
        [Validators.required, this.amountValidator()],
      ],
      description: [memorized.description, Validators.required],
      categoryId: [memorized.categoryId, Validators.required],
      sharedAmount: [memorized.sharedAmount, Validators.required],
      allocatedAmount: [memorized.allocatedAmount, Validators.required],
    });
    let splits: Split[] = [];
    this.data.memorized.splits?.forEach((split: Split) => {
      splits.push(new Split({ ...split }));
    });
    this.splitsDataSource.set(splits);
    this.updateForm();
    afterNextRender(() => {
      this.totalAmountField().nativeElement.value =
        this.decimalPipe.transform(memorized.totalAmount, '1.2-2') || '0.00';
      this.proportionalAmountField().nativeElement.value =
        this.decimalPipe.transform(memorized.allocatedAmount, '1.2-2') ||
        '0.00';
    });
    afterRender(() => {
      this.addSelectFocus();
    });
  }

  addSelectFocus(): void {
    this.inputElements().forEach((elementRef: ElementRef<any>) => {
      const input = elementRef.nativeElement as HTMLInputElement;
      input.addEventListener('focus', function () {
        this.select();
      });
    });
  }

  amountValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      return control.value === 0 ? { zeroAmount: true } : null;
    };
  }

  public get e() {
    return this.editMemorizedForm.controls;
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

  getSplitControl(index: number, controlName: string): FormControl {
    return (this.splitForm.at(index) as FormGroup).get(
      controlName
    ) as FormControl;
  }

  saveValue(e: HTMLInputElement, control: string = ''): void {
    this.editMemorizedForm.patchValue({
      [control]: +e.value,
    });
  }

  updateForm(): void {
    this.splitForm = new FormArray(
      this.splitsDataSource().map(
        (x: any) =>
          new FormGroup({
            owedByMemberId: new FormControl(x.owedByMemberId),
            assignedAmount: new FormControl(
              this.decimalPipe.transform(x.assignedAmount, '1.2-2') || '0.00'
            ),
          })
      )
    );
  }

  addRow(): void {
    if (this.splitsDataSource().length > 0) {
      this.saveSplitsData();
    }
    this.splitsDataSource.update((ds) => [
      ...ds,
      new Split({ assignedAmount: 0, allocatedAmount: 0 }),
    ]);
    this.updateForm();
  }

  saveSplitsData(): void {
    let splits = [];
    for (let i = 0; i < this.splitForm?.controls.length; i++) {
      const split = this.splitForm.controls[i].value;
      if (split.owedByMemberId !== '') {
        splits[i] = new Split({
          owedByMemberId: split.owedByMemberId,
          assignedAmount: this.stringUtils.toNumber(split.assignedAmount),
          allocatedAmount: 0,
        });
      }
    }
    this.splitsDataSource.set(splits);
    this.allocateSharedAmounts();
  }

  deleteRow(index: number): void {
    this.splitForm.controls.splice(index, 1);
    this.saveSplitsData();
    this.updateForm();
  }

  allocateSharedAmounts(): void {
    if (this.splitsDataSource().length > 0) {
      let splits = [...this.splitsDataSource()];
      for (let i = 0; i < splits.length; ) {
        if (!splits[i].owedByMemberId && splits[i].assignedAmount === 0) {
          splits.splice(i, 1);
        } else {
          i++;
        }
      }
      this.splitsDataSource.set([...splits]);
      const splitCount: number = splits.length;
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
      splits.forEach((split) => {
        if (split.owedByMemberId != '') {
          split.allocatedAmount = +(sharedAmount / splitCount).toFixed(2);
        }
      });
      splits.forEach((split) => {
        if (split.owedByMemberId != '') {
          if (splitTotal == 0) {
            split.allocatedAmount += +(allocatedAmount / splitCount).toFixed(2);
          } else {
            split.allocatedAmount = +(
              +split.assignedAmount +
              +split.allocatedAmount +
              (+split.assignedAmount / splitTotal) * allocatedAmount
            ).toFixed(2);
          }
        }
      });
      if (!this.memorizedFullyAllocated() && splitCount > 0) {
        let diff = +(totalAmount - this.getAllocatedTotal()).toFixed(2);
        for (let i = 0; diff != 0; ) {
          if (diff > 0) {
            splits[i].allocatedAmount += 0.01;
            diff -= 0.01;
          } else {
            splits[i].allocatedAmount -= 0.01;
            diff += 0.01;
          }
          if (i < splits.length - 1) {
            i++;
          } else {
            i = 0;
          }
        }
      }
      this.updateForm();
    }
  }

  getAssignedTotal = (): number =>
    +this.splitsDataSource()
      .reduce((total, s) => (total += +s.assignedAmount), 0)
      .toFixed(2);

  getAllocatedTotal = (): number =>
    +this.splitsDataSource()
      .reduce((total, s) => (total += +s.allocatedAmount), 0)
      .toFixed(2);

  memorizedFullyAllocated = (): boolean =>
    this.editMemorizedForm.value.amount == this.getAllocatedTotal();

  missingSplitMember(): boolean {
    let missing: boolean = false;
    this.splitForm?.controls.forEach((s) => {
      if (s.value.owedByMemberId === null) {
        missing = true;
      }
    });
    return missing;
  }

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
    this.splitsDataSource().forEach((s) => {
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
}
