import { Component, inject, OnInit, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import {
  MAT_DIALOG_DATA,
  MatDialogContent,
  MatDialogRef,
} from '@angular/material/dialog';

@Component({
    selector: 'app-help',
    templateUrl: './help.component.html',
    styleUrl: './help.component.scss',
    imports: [MatDialogContent, MatIcon]
})
export class HelpComponent implements OnInit {
  dialogRef = inject(MatDialogRef<HelpComponent>);
  data: any = inject(MAT_DIALOG_DATA);

  page = signal<string>('');
  title = signal<string>('');

  ngOnInit(): void {
    this.page.set(this.data.page);
    this.title.set(this.data.title);
  }

  close(): void {
    this.dialogRef.close();
  }
}
