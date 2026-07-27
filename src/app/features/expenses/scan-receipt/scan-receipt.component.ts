import {
  afterEveryRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  Signal,
  viewChildren,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatOptionModule } from '@angular/material/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { DocRefCompareDirective } from '@directives/doc-ref-compare.directive';
import { FormatCurrencyInputDirective } from '@directives/format-currency-input.directive';
import {
  HelpDialogComponent,
  HelpDialogData,
} from '@features/help/help-dialog/help-dialog.component';
import { Member } from '@models/member';
import { ParsedReceipt } from '@models/receipt-scan';
import { CameraService } from '@services/camera.service';
import { LocaleService } from '@services/locale.service';
import { ReceiptFileSelectionService } from '@services/receipt-file-selection.service';
import {
  ReceiptScanHandoffService,
  ReceiptScanPayload,
  ReceiptScanSplit,
} from '@services/receipt-scan-handoff.service';
import { ReceiptScanService } from '@services/receipt-scan.service';
import { CurrencyPipe } from '@shared/pipes/currency.pipe';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { StringUtils } from '@utils/string-utils.service';
import { DocumentReference } from 'firebase/firestore';

const LOW_CONFIDENCE_THRESHOLD = 70;

interface ScanLineItemRow {
  description: string;
  amount: string;
  confidence: number;
  assignedTo: DocumentReference<Member> | null;
}

/**
 * Receipt-scan wizard: photographs/uploads a receipt, runs it through the
 * scanReceipt Function for OCR, then lets the user assign each line item to
 * a member (or leave it shared) before handing off to Add Expense with the
 * total, per-member amounts, and the shared pool (tax + tip + unassigned
 * items) pre-filled. See .claude/future-ideas.md for background.
 */
@Component({
  selector: 'app-scan-receipt',
  templateUrl: './scan-receipt.component.html',
  styleUrl: './scan-receipt.component.scss',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSelectModule,
    MatOptionModule,
    MatTooltipModule,
    DocRefCompareDirective,
    FormatCurrencyInputDirective,
    CurrencyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScanReceiptComponent {
  protected readonly router = inject(Router);
  protected readonly dialog = inject(MatDialog);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly loading = inject(LoadingService);
  protected readonly groupStore = inject(GroupStore);
  protected readonly memberStore = inject(MemberStore);
  protected readonly cameraService = inject(CameraService);
  protected readonly localeService = inject(LocaleService);
  protected readonly stringUtils = inject(StringUtils);
  protected readonly receiptFileSelection = inject(ReceiptFileSelectionService);
  protected readonly receiptScanService = inject(ReceiptScanService);
  protected readonly receiptScanHandoff = inject(ReceiptScanHandoffService);

  activeMembers: Signal<Member[]> = this.memberStore.activeGroupMembers;

  protected readonly receiptFile = signal<File | null>(null);
  protected readonly fileName = signal<string>('');
  protected readonly hasScanned = signal<boolean>(false);

  protected readonly totalAmount = signal<string>('0.00');
  protected readonly taxAmount = signal<string>('0.00');
  protected readonly tipAmount = signal<string>('0.00');
  protected readonly description = signal<string>('');
  protected readonly lineItems = signal<ScanLineItemRow[]>([]);

  inputElements = viewChildren<ElementRef>('inputElement');

  constructor() {
    afterEveryRender(() => {
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

  protected readonly totalAmountValue = computed(() =>
    this.stringUtils.toNumber(this.totalAmount())
  );
  protected readonly taxValue = computed(() =>
    this.stringUtils.toNumber(this.taxAmount())
  );
  protected readonly tipValue = computed(() =>
    this.stringUtils.toNumber(this.tipAmount())
  );

  /** Items not assigned to a specific member - split evenly across assigned members by the add-expense form's "Evenly Shared Remainder". */
  protected readonly unassignedItemsTotal = computed(() => {
    const total = this.lineItems()
      .filter((item) => !item.assignedTo)
      .reduce((sum, item) => sum + this.stringUtils.toNumber(item.amount), 0);
    return this.localeService.roundToCurrency(total);
  });

  /** Tax + tip - split proportionally to each member's assigned item total by the add-expense form's "Proportional Amount". */
  protected readonly taxTipTotal = computed(() =>
    this.localeService.roundToCurrency(this.taxValue() + this.tipValue())
  );

  /** Per-member subtotal from directly-assigned items only (their eventual share of the pool above is computed later on Add Expense). */
  protected readonly memberSubtotals = computed(() => {
    const totals = new Map<string, number>();
    this.lineItems().forEach((item) => {
      if (!item.assignedTo) return;
      const key = item.assignedTo.id;
      totals.set(
        key,
        (totals.get(key) ?? 0) + this.stringUtils.toNumber(item.amount)
      );
    });
    return this.activeMembers()
      .filter((m) => totals.has(m.id))
      .map((m) => ({
        member: m,
        amount: this.localeService.roundToCurrency(totals.get(m.id)!),
      }));
  });

  protected readonly canContinue = computed(
    () => !!this.receiptFile() && this.totalAmountValue() > 0
  );

  protected isLowConfidence(item: ScanLineItemRow): boolean {
    return item.confidence < LOW_CONFIDENCE_THRESHOLD;
  }

  protected async selectReceiptPhoto(): Promise<void> {
    const accepted = await this.receiptFileSelection.ensureReceiptPolicyAccepted();
    if (!accepted) return;

    const result = await this.receiptFileSelection.pickSource(
      this.cameraService.isAvailable()
    );

    if (result.type === 'cancelled') return;
    if (result.type === 'browseFiles') {
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      fileInput?.click();
      return;
    }

    this.setSelectedFile(result.file);
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.setSelectedFile(file);
    input.value = '';
  }

  protected rescan(): void {
    this.receiptFile.set(null);
    this.fileName.set('');
    this.hasScanned.set(false);
    this.lineItems.set([]);
  }

  protected addItem(): void {
    this.lineItems.update((items) => [
      ...items,
      {
        description: '',
        amount: this.localeService.getFormattedZero(),
        confidence: 100,
        assignedTo: null,
      },
    ]);
  }

  protected removeItem(index: number): void {
    this.lineItems.update((items) => items.filter((_, i) => i !== index));
  }

  protected updateItem(index: number, patch: Partial<ScanLineItemRow>): void {
    this.lineItems.update((items) =>
      items.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  }

  protected onContinue(): void {
    const file = this.receiptFile();
    if (!file || !this.canContinue()) return;

    const splitsByMember = new Map<string, ReceiptScanSplit>();
    this.lineItems().forEach((item) => {
      if (!item.assignedTo) return;
      const key = item.assignedTo.id;
      const amount = this.stringUtils.toNumber(item.amount);
      const existing = splitsByMember.get(key);
      if (existing) {
        existing.assignedAmount += amount;
      } else {
        splitsByMember.set(key, {
          memberRef: item.assignedTo,
          assignedAmount: amount,
        });
      }
    });

    const payload: ReceiptScanPayload = {
      file,
      fileName: file.name,
      totalAmount: this.totalAmountValue(),
      description: this.description(),
      sharedAmount: this.unassignedItemsTotal(),
      proportionalAmount: this.taxTipTotal(),
      splits: [...splitsByMember.values()].map((s) => ({
        ...s,
        assignedAmount: this.localeService.roundToCurrency(s.assignedAmount),
      })),
    };
    this.receiptScanHandoff.setPayload(payload);
    this.router.navigate(['/expenses/add']);
  }

  protected onCancel(): void {
    this.router.navigate(['/expenses']);
  }

  protected showHelp(): void {
    const dialogConfig: MatDialogConfig<HelpDialogData> = {
      disableClose: false,
      maxWidth: '80vw',
      data: { sectionId: 'scan-receipt' },
    };
    this.dialog.open(HelpDialogComponent, dialogConfig);
  }

  private setSelectedFile(file: File): void {
    const validated = this.receiptFileSelection.validateFile(file);
    if (!validated) return;
    this.receiptFile.set(validated);
    this.fileName.set(validated.name);
    this.scanFile(validated);
  }

  private async scanFile(file: File): Promise<void> {
    const groupId = this.groupStore.currentGroup()?.id;
    if (!groupId) return;

    try {
      this.loading.loadingOn();
      const parsed = await this.receiptScanService.scanReceipt(groupId, file);
      this.applyParsedReceipt(parsed);
    } catch (error) {
      console.error('Error scanning receipt:', error);
      this.snackbar.openFromComponent(CustomSnackbarComponent, {
        data: {
          message:
            'Failed to scan the receipt. You can still enter the details manually below.',
        },
      });
      this.applyParsedReceipt({
        total: null,
        subtotal: null,
        tax: null,
        tip: null,
        lineItems: [],
        rawText: '',
      });
    } finally {
      this.loading.loadingOff();
    }
  }

  private applyParsedReceipt(parsed: ParsedReceipt): void {
    const fallbackTotal =
      (parsed.subtotal ?? 0) + (parsed.tax ?? 0) + (parsed.tip ?? 0);
    this.totalAmount.set(this.#formatForInput(parsed.total ?? fallbackTotal));
    this.taxAmount.set(this.#formatForInput(parsed.tax ?? 0));
    this.tipAmount.set(this.#formatForInput(parsed.tip ?? 0));
    this.description.set(this.#guessDescription(parsed.rawText));
    this.lineItems.set(
      parsed.lineItems.map((item) => ({
        description: item.description,
        amount: this.#formatForInput(item.amount),
        confidence: item.confidence,
        assignedTo: null,
      }))
    );
    this.hasScanned.set(true);
  }

  #guessDescription(rawText: string): string {
    const firstLine = rawText
      .split('\n')
      .find((line) => line.trim().length > 0);
    return firstLine?.trim() ?? '';
  }

  #formatForInput(value: number): string {
    const rounded = this.localeService.roundToCurrency(value);
    const currency = this.localeService.currency();
    return rounded
      .toFixed(currency.decimalPlaces)
      .replace('.', currency.decimalSeparator);
  }
}
