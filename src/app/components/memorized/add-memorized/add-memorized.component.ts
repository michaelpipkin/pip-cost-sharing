import { CurrencyPipe, DecimalPipe } from '@angular/common';
import {
  afterNextRender,
  afterRender,
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  Signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { Storage } from '@angular/fire/storage';
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
  ],
})
export class AddMemorizedComponent implements OnInit {
  dialog = inject(MatDialog);
  router = inject(Router);
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

  currentMember: Signal<Member> = this.memberService.currentMember;
  currentGroup: Signal<Group> = this.groupService.currentGroup;
  activeMembers: Signal<Member[]> = this.memberService.activeGroupMembers;
  #categories: Signal<Category[]> = this.categoryService.groupCategories;

  activeCategories = computed<Category[]>(() => {
    return this.#categories().filter((c) => c.active);
  });

  totalAmountField = viewChild<ElementRef>('totalAmount');
  allocatedAmountField = viewChild<ElementRef>('propAmount');
  inputElements = viewChildren<ElementRef>('inputElement');
  memberAmounts = viewChildren<ElementRef>('memberAmount');

  addMemorizedForm = this.fb.group({
    paidByMemberId: [this.currentMember().id, Validators.required],
    date: [new Date(), Validators.required],
    amount: [0, [Validators.required, this.amountValidator()]],
    description: ['', Validators.required],
    categoryId: ['', Validators.required],
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
    this.allocateSharedAmounts();
  }

  addAllActiveGroupMembers(): void {
    const existingMemberIds = this.splitsFormArray.controls.map(
      (control) => control.get('owedByMemberId').value
    );

    this.activeMembers().forEach((member: Member) => {
      if (!existingMemberIds.includes(member.id)) {
        this.splitsFormArray.push(
          this.fb.group({
            owedByMemberId: [member.id, Validators.required],
            assignedAmount: ['0.00', Validators.required],
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
    this.addMemorizedForm.value.amount == this.getAllocatedTotal();

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
    this.splitsFormArray.value.forEach((s: Split) => {
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
        this.snackBar.open('Memorized expense added.', 'OK');
        this.router.navigate(['/memorized']);
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

  onCancel(): void {
    this.router.navigate(['/memorized']);
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
