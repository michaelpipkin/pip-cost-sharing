import { DecimalPipe } from '@angular/common';
import {
  afterEveryRender,
  afterNextRender,
  AfterViewInit,
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
import { Router } from '@angular/router';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@components/help/help-dialog/help-dialog.component';
import { Category } from '@models/category';
import { Expense } from '@models/expense';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { SerializableMemorized } from '@models/memorized';
import { Split } from '@models/split';
import { CategoryService } from '@services/category.service';
import { DemoService } from '@services/demo.service';
import { ExpenseService } from '@services/expense.service';
import { LocaleService } from '@services/locale.service';
import { MemorizedService } from '@services/memorized.service';
import { TourService } from '@services/tour.service';
import { DateShortcutKeysDirective } from '@shared/directives/date-plus-minus.directive';
import { DocRefCompareDirective } from '@shared/directives/doc-ref-compare.directive';
import { FormatCurrencyInputDirective } from '@shared/directives/format-currency-input.directive';
import { LoadingService } from '@shared/loading/loading.service';
import { CurrencyPipe } from '@shared/pipes/currency.pipe';
import { CalculatorOverlayService } from '@shared/services/calculator-overlay.service';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { AllocationUtilsService } from '@utils/allocation-utils.service';
import { DateUtils } from '@utils/date-utils.service';
import { StringUtils } from '@utils/string-utils.service';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { DocumentReference } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

@Component({
  selector: 'app-add-expense',
  templateUrl: './add-expense.component.html',
  styleUrl: './add-expense.component.scss',
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
    DateShortcutKeysDirective,
    DocRefCompareDirective,
  ],
})
export class AddExpenseComponent implements OnInit, AfterViewInit {
  protected readonly storage = inject(getStorage);
  protected readonly analytics = inject(getAnalytics);
  protected readonly fb = inject(FormBuilder);
  protected readonly router = inject(Router);
  protected readonly dialog = inject(MatDialog);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly categoryStore = inject(CategoryStore);
  protected readonly categoryService = inject(CategoryService);
  protected readonly demoService = inject(DemoService);
  protected readonly expenseService = inject(ExpenseService);
  protected readonly memorizedService = inject(MemorizedService);
  protected readonly tourService = inject(TourService);
  protected readonly loading = inject(LoadingService);
  protected readonly snackBar = inject(MatSnackBar);
  protected readonly decimalPipe = inject(DecimalPipe);
  protected readonly stringUtils = inject(StringUtils);
  protected readonly allocationUtils = inject(AllocationUtilsService);
  protected readonly calculatorOverlay = inject(CalculatorOverlayService);
  protected readonly localeService = inject(LocaleService);

  currentMember: Signal<Member> = this.memberStore.currentMember;
  currentGroup: Signal<Group> = this.groupStore.currentGroup;
  activeMembers: Signal<Member[]> = this.memberStore.activeGroupMembers;
  #categories: Signal<Category[]> = this.categoryStore.groupCategories;

  memorizedExpense = signal<SerializableMemorized | null>(null);

  activeCategories = computed<Category[]>(() => {
    return this.#categories().filter((c) => c.active);
  });

  fileName = model<string>('');
  receiptFile = model<File | null>(null);
  splitByPercentage = model<boolean>(false);

  datePicker = viewChild<ElementRef>('datePicker');
  totalAmountField = viewChild<ElementRef>('totalAmount');
  allocatedAmountField = viewChild<ElementRef>('propAmount');
  inputElements = viewChildren<ElementRef>('inputElement');
  memberAmounts = viewChildren<ElementRef>('memberAmount');
  memberPercentages = viewChildren<ElementRef>('memberPercentage');

  addExpenseForm = this.fb.group({
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
    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras?.state?.expense) {
      this.memorizedExpense.set(navigation!.extras!.state!.expense);
    }
    afterNextRender(() => {
      if (!!this.memorizedExpense()) {
        const expense: SerializableMemorized = this.memorizedExpense();
        this.totalAmountField().nativeElement.value =
          this.decimalPipe.transform(expense.totalAmount, '1.2-2') || '0.00';
        this.allocatedAmountField().nativeElement.value =
          this.decimalPipe.transform(expense.allocatedAmount, '1.2-2') ||
          '0.00';
        this.memberAmounts().forEach(
          (elementRef: ElementRef, index: number) => {
            elementRef.nativeElement.value =
              this.decimalPipe.transform(
                expense.splits[index].assignedAmount,
                '1.2-2'
              ) || '0.00';
          }
        );
      } else {
        const formattedZero = this.localeService.getFormattedZero();
        this.totalAmountField().nativeElement.value = formattedZero;
        this.allocatedAmountField().nativeElement.value = formattedZero;
        this.memberAmounts().forEach((elementRef: ElementRef) => {
          elementRef.nativeElement.value = formattedZero;
        });
      }
    });
    afterEveryRender(() => {
      this.addSelectFocus();
    });
  }

  ngOnInit(): void {
    // Turn off loading indicator once the component is initialized
    this.loading.loadingOff();

    if (this.activeCategories().length == 1) {
      this.addExpenseForm.patchValue({
        category: this.activeCategories()[0].ref,
      });
    }
    if (!!this.memorizedExpense()) {
      const expense: SerializableMemorized = this.memorizedExpense();
      this.splitByPercentage.set(expense.splitByPercentage);

      // Find the category and member by ID
      const category = this.#categories().find(
        (c) => c.id === expense.categoryId
      );
      const paidByMember = this.activeMembers().find(
        (m) => m.id === expense.paidByMemberId
      );

      this.addExpenseForm.patchValue({
        paidByMember: paidByMember?.ref,
        date: new Date(),
        amount: expense.totalAmount,
        description: expense.description,
        category: category?.ref,
        sharedAmount: expense.sharedAmount,
        allocatedAmount: expense.allocatedAmount,
      });

      expense.splits.forEach((split) => {
        // Find the member by ID
        const owedByMember = this.activeMembers().find(
          (m) => m.id === split.owedByMemberId
        );

        this.splitsFormArray.push(
          this.fb.group({
            owedByMemberRef: owedByMember?.ref,
            assignedAmount: split.assignedAmount,
            percentage: split.percentage,
            allocatedAmount: split.allocatedAmount,
          })
        );
      });
    } else if (this.currentGroup().autoAddMembers) {
      this.addAllActiveGroupMembers();
    }
  }

  ngAfterViewInit(): void {
    this.tourService.checkForContinueTour('add-expense');
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
      (member) => !existingMembers.includes(member.id)
    );
    return this.fb.group({
      owedByMemberRef: [
        availableMembers.length > 0 ? availableMembers[0].ref : null,
        Validators.required,
      ],
      assignedAmount: [
        this.localeService.getFormattedZero(),
        Validators.required,
      ],
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
    return this.addExpenseForm.controls;
  }

  get splitsFormArray(): FormArray {
    return this.addExpenseForm.get('splits') as FormArray;
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
            assignedAmount: [
              this.localeService.getFormattedZero(),
              Validators.required,
            ],
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
        input.nativeElement.value = this.localeService.getFormattedZero();
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

  onFileSelected(e): void {
    if (e.target.files.length > 0) {
      const file: File = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        this.snackBar.open(
          'File is too large. File size limited to 5MB.',
          'OK'
        );
      } else {
        this.receiptFile.set(file);
        this.fileName.set(file.name);
        this.addExpenseForm.markAsDirty();
      }
    }
  }

  removeFile(): void {
    this.receiptFile.set(null);
    this.fileName.set('');
  }

  onSplitByPercentageClick(): void {
    this.splitByPercentage.set(true);
    this.addExpenseForm.markAsDirty();
    this.allocateByPercentage();
  }

  onSplitByAmountClick(): void {
    this.splitByPercentage.set(false);
    this.addExpenseForm.markAsDirty();
    this.allocateSharedAmounts();
  }

  updateTotalAmount(): void {
    if (this.splitByPercentage()) {
      this.allocateByPercentage();
    } else {
      this.allocateSharedAmounts();
    }
  }

  allocateSharedAmounts(): void {
    const val = this.addExpenseForm.value;
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
      this.addExpenseForm.patchValue({
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
      let splits: Split[] = [...this.splitsFormArray.value];
      for (let i = 0; i < splits.length; ) {
        if (!splits[i].owedByMemberRef && splits[i].assignedAmount === 0) {
          splits.splice(i, 1);
        } else {
          if (i < splits.length - 1) {
            splits[i].percentage = +splits[i].percentage;
            totalPercentage += splits[i].percentage;
          } else {
            const remainingPercentage: number =
              this.localeService.roundToCurrency(+(100 - totalPercentage));
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
      const val = this.addExpenseForm.value;
      const totalAmount: number = +val.amount;
      splits.forEach((split: Split) => {
        split.allocatedAmount = this.localeService.roundToCurrency(
          +((totalAmount * +split.percentage) / 100)
        );
      });
      const allocatedTotal: number = this.localeService.roundToCurrency(
        +splits.reduce((total, s) => (total += s.allocatedAmount), 0)
      );
      const percentageTotal: number = this.localeService.roundToCurrency(
        +splits.reduce((total, s) => (total += s.percentage), 0)
      );
      if (
        allocatedTotal !== totalAmount &&
        percentageTotal === 100 &&
        splitCount > 0
      ) {
        let diff = this.localeService.roundToCurrency(
          +(totalAmount - allocatedTotal)
        );
        const increment = this.localeService.getSmallestIncrement();
        for (let i = 0; diff != 0; ) {
          if (diff > 0) {
            splits[i].allocatedAmount += increment;
            diff = this.localeService.roundToCurrency(+(diff - increment));
          } else {
            splits[i].allocatedAmount -= increment;
            diff = this.localeService.roundToCurrency(+(diff + increment));
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
    this.localeService.roundToCurrency(
      +[...this.splitsFormArray.value].reduce(
        (total, s) =>
          (total += this.localeService.roundToCurrency(+s.assignedAmount)),
        0
      )
    );

  getAllocatedTotal = (): number =>
    this.localeService.roundToCurrency(
      +[...this.splitsFormArray.value].reduce(
        (total, s) =>
          (total += this.localeService.roundToCurrency(+s.allocatedAmount)),
        0
      )
    );

  expenseFullyAllocated = (): boolean =>
    this.addExpenseForm.value.amount == this.getAllocatedTotal();

  async onSubmit(saveAndAdd: boolean = false): Promise<void> {
    if (this.demoService.isInDemoMode()) {
      this.demoService.showDemoModeRestrictionMessage();
      this.router.navigate(['/demo/expenses']);
      return;
    }
    try {
      this.loading.loadingOn();
      const val = this.addExpenseForm.value;
      const expenseDate = DateUtils.toUTCTimestamp(val.date);
      const expense: Partial<Expense> = {
        date: expenseDate,
        description: val.description,
        categoryRef: val.category,
        paidByMemberRef: val.paidByMember,
        paid: false,
        sharedAmount: val.sharedAmount,
        allocatedAmount: val.allocatedAmount,
        totalAmount: val.amount,
        splitByPercentage: this.splitByPercentage(),
      };
      let splits: Partial<Split>[] = [];
      this.splitsFormArray.value.forEach((s) => {
        if (s.allocatedAmount !== 0) {
          const split: Partial<Split> = {
            date: expenseDate,
            categoryRef: val.category,
            assignedAmount: s.assignedAmount,
            percentage: s.percentage,
            allocatedAmount: s.allocatedAmount,
            paidByMemberRef: val.paidByMember,
            owedByMemberRef: s.owedByMemberRef,
            paid: s.owedByMemberRef.eq(val.paidByMember),
          };
          splits.push(split);
        }
      });
      await this.expenseService.addExpense(
        this.currentGroup().id,
        expense,
        splits,
        this.receiptFile()
      );
      this.snackBar.open('Expense added.', 'OK');
      if (saveAndAdd) {
        this.addExpenseForm.reset();
        this.splitsFormArray.clear();
        this.addExpenseForm.patchValue({
          paidByMember: this.currentMember().ref,
          date: new Date(),
          amount: 0,
          allocatedAmount: 0,
        });
        const formattedZero = this.localeService.getFormattedZero();
        this.totalAmountField().nativeElement.value = formattedZero;
        this.allocatedAmountField().nativeElement.value = formattedZero;
        this.memberAmounts().forEach((elementRef: ElementRef) => {
          elementRef.nativeElement.value = formattedZero;
        });
        this.fileName.set('');
        this.receiptFile.set(null);
        this.addExpenseForm.enable();
        if (this.currentGroup().autoAddMembers) {
          this.addAllActiveGroupMembers();
        }
        this.addSelectFocus();
      } else {
        this.router.navigate(['/expenses']);
      }
    } catch (error) {
      if (error instanceof Error) {
        this.snackBar.open(error.message, 'Close');
        logEvent(this.analytics, 'error', {
          component: this.constructor.name,
          action: 'add_expense',
          message: error.message,
        });
      } else {
        this.snackBar.open(
          'Something went wrong - could not save expense.',
          'Close'
        );
      }
    } finally {
      this.loading.loadingOff();
    }
  }

  onCancel(): void {
    if (this.demoService.isInDemoMode()) {
      this.router.navigate(['/demo/expenses']);
    } else {
      this.router.navigate(['/expenses']);
    }
  }

  openCalculator(event: Event, controlName: string, index?: number): void {
    const target = event.target as HTMLElement;
    this.calculatorOverlay.openCalculator(target, (result: number) => {
      if (index !== undefined) {
        // Handle FormArray controls (splits)
        const control = this.splitsFormArray.at(index).get(controlName);
        if (control) {
          control.setValue(this.localeService.roundToCurrency(result), {
            emitEvent: true,
          });
          control.markAsTouched();
          control.markAsDirty();
        }
      } else {
        // Handle regular form controls
        const control = this.addExpenseForm.get(controlName);
        if (control) {
          control.setValue(this.localeService.roundToCurrency(result), {
            emitEvent: true,
          });
          control.markAsTouched();
          control.markAsDirty();
        }
      }

      // Trigger allocation updates
      if (this.splitByPercentage()) {
        this.allocateByPercentage();
      } else {
        this.allocateSharedAmounts();
      }
    });
  }

  showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'add-edit-expenses' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }

  startTour(): void {
    this.tourService.startAddExpenseTour(true);
  }
}
