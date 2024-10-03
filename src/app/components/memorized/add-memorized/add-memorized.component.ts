import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { Storage } from '@angular/fire/storage';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
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
import { FormatCurrencyInputDirective } from '@shared/directives/format-currency-input.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { StringUtils } from 'src/app/utilities/string-utils.service';
import {
  Component,
  ElementRef,
  inject,
  OnInit,
  Signal,
  model,
  afterRender,
  viewChild,
  viewChildren,
  computed,
  afterNextRender,
} from '@angular/core';
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
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogConfig,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTable, MatTableModule } from '@angular/material/table';

@Component({
  selector: 'app-add-memorized',
  standalone: true,
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
    DecimalPipe,
    FormatCurrencyInputDirective,
  ],
})
export class AddMemorizedComponent implements OnInit {
  dialogRef = inject(MatDialogRef<AddMemorizedComponent>);
  dialog = inject(MatDialog);
  fb = inject(FormBuilder);
  groupService = inject(GroupService);
  memberService = inject(MemberService);
  categoryService = inject(CategoryService);
  memorizedService = inject(MemorizedService);
  loading = inject(LoadingService);
  snackBar = inject(MatSnackBar);
  storage = inject(Storage);
  analytics = inject(Analytics);
  decimalPipe = inject(DecimalPipe);
  stringUtils = inject(StringUtils);
  data: any = inject(MAT_DIALOG_DATA);

  currentMember: Signal<Member> = this.memberService.currentMember;
  currentGroup: Signal<Group> = this.groupService.currentGroup;
  activeMembers: Signal<Member[]> = this.memberService.activeGroupMembers;
  #categories: Signal<Category[]> = this.categoryService.groupCategories;

  activeCategories = computed<Category[]>(() => {
    return this.#categories().filter((c) => c.active);
  });

  splitsDataSource = model<Split[]>([]);

  addMemorizedForm: FormGroup;
  splitForm: FormArray;

  splitsTable = viewChild<MatTable<Split>>('splitsTable');
  totalAmountField = viewChild<ElementRef>('totalAmount');
  allocatedAmountField = viewChild<ElementRef>('propAmount');
  inputElements = viewChildren<ElementRef>('inputElement');

  constructor() {
    this.addMemorizedForm = this.fb.group({
      paidByMemberId: [this.currentMember().id, Validators.required],
      date: [new Date(), Validators.required],
      amount: [0, [Validators.required, this.amountValidator()]],
      description: ['', Validators.required],
      categoryId: ['', Validators.required],
      sharedAmount: [0.0, Validators.required],
      allocatedAmount: [0, Validators.required],
    });
    afterNextRender(() => {
      if (this.data.memorized) {
        this.totalAmountField().nativeElement.value =
          this.decimalPipe.transform(
            this.data.memorized.totalAmount,
            '1.2-2'
          ) || '0.00';
        this.allocatedAmountField().nativeElement.value =
          this.decimalPipe.transform(
            this.data.memorized.allocatedAmount,
            '1.2-2'
          ) || '0.00';
      } else {
        this.totalAmountField().nativeElement.value = '0.00';
        this.allocatedAmountField().nativeElement.value = '0.00';
      }
    });
    afterRender(() => {
      this.addSelectFocus();
    });
  }

  ngOnInit(): void {
    if (this.activeCategories().length == 1) {
      this.addMemorizedForm.patchValue({
        categoryId: this.activeCategories()[0].id,
      });
    }
    if (this.data.memorized) {
      this.splitsDataSource.set(this.data.memorized.splits);
      this.updateForm();
    } else {
      this.addAllActiveGroupMembers();
    }
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
    return this.addMemorizedForm.controls;
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
    this.addMemorizedForm.patchValue({
      [control]: +e.value,
    });
  }

  updateForm(): void {
    this.splitForm = new FormArray(
      this.splitsDataSource().map(
        (x: Split) =>
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

  deleteRow(index: number): void {
    this.splitForm.controls.splice(index, 1);
    this.saveSplitsData();
    this.updateForm();
  }

  addAllActiveGroupMembers(): void {
    this.activeMembers().forEach((member: Member) => {
      const existingSplits = this.splitsDataSource().map(
        (s) => s.owedByMemberId
      );
      if (!existingSplits.includes(member.id)) {
        this.splitsDataSource.update((ds) => [
          ...ds,
          new Split({
            owedByMemberId: member.id,
            assignedAmount: 0,
            allocatedAmount: 0,
          }),
        ]);
      }
    });
    this.updateForm();
    this.saveSplitsData();
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
      const val = this.addMemorizedForm.value;
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
        this.addMemorizedForm.patchValue({
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
    this.addMemorizedForm.value.amount == this.getAllocatedTotal();

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
    this.addMemorizedForm.disable();
    const val = this.addMemorizedForm.value;
    const memorized: Partial<Memorized> = {
      description: val.description,
      categoryId: val.categoryId,
      paidByMemberId: val.paidByMemberId,
      sharedAmount: +val.sharedAmount,
      allocatedAmount: +val.allocatedAmount,
      totalAmount: +val.amount,
    };
    let splits: Partial<Split>[] = [];
    this.splitsDataSource().forEach((s: Split) => {
      const split: Partial<Split> = {
        categoryId: val.categoryId,
        assignedAmount: +s.assignedAmount,
        allocatedAmount: +s.allocatedAmount,
        paidByMemberId: val.paidByMemberId,
        owedByMemberId: s.owedByMemberId,
      };
      splits.push(split);
    });
    memorized.splits = splits;
    this.loading.loadingOn();
    this.memorizedService
      .addMemorized(this.currentGroup().id, memorized)
      .then(() => {
        this.dialogRef.close({
          success: true,
          operation: 'memorized',
        });
      })
      .catch((err: Error) => {
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'memorize_expense',
          message: err.message,
        });
        this.snackBar.open(
          'Something went wrong - could not memorize expense.',
          'Close'
        );
        this.addMemorizedForm.enable();
      })
      .finally(() => this.loading.loadingOff());
  }
}
