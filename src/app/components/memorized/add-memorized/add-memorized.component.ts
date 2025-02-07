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
import { MemorizedService } from '@services/memorized.service';
import { FormatCurrencyInputDirective } from '@shared/directives/format-currency-input.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { getStorage } from 'firebase/storage';
import { StringUtils } from 'src/app/utilities/string-utils.service';
import { AddEditMemorizedHelpComponent } from '../add-edit-memorized-help/add-edit-memorized-help.component';
import {
  afterNextRender,
  afterRender,
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
  storage = inject(getStorage);
  analytics = inject(getAnalytics);
  dialog = inject(MatDialog);
  router = inject(Router);
  fb = inject(FormBuilder);
  groupStore = inject(GroupStore);
  memberStore = inject(MemberStore);
  categoryStore = inject(CategoryStore);
  memorizedService = inject(MemorizedService);
  loading = inject(LoadingService);
  snackBar = inject(MatSnackBar);
  decimalPipe = inject(DecimalPipe);
  stringUtils = inject(StringUtils);

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
    const existingMemberIds = this.splitsFormArray.controls.map(
      (control) => control.get('owedByMemberId').value
    );
    const availableMembers = this.activeMembers().filter(
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
    const existingMemberIds = this.splitsFormArray.controls.map(
      (control) => control.get('owedByMemberId').value
    );

    this.activeMembers().forEach((member: Member) => {
      if (!existingMemberIds.includes(member.id)) {
        this.splitsFormArray.push(
          this.fb.group({
            owedByMemberId: [member.id, Validators.required],
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
      splitByPercentage: this.splitByPercentage(),
    };
    let splits: Partial<Split>[] = [];
    this.splitsFormArray.value.forEach((s: Split) => {
      const split: Partial<Split> = {
        categoryId: val.categoryId,
        assignedAmount: +s.assignedAmount,
        percentage: +s.percentage,
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
      disableClose: false,
      maxWidth: '80vw',
    };
    this.dialog.open(AddEditMemorizedHelpComponent, dialogConfig);
  }
}
