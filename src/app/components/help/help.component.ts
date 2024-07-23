import { Component, inject, OnInit } from '@angular/core';
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
  standalone: true,
  imports: [MatDialogContent, MatIcon],
})
export class HelpComponent implements OnInit {
  dialogRef = inject(MatDialogRef<HelpComponent>);
  data: any = inject(MAT_DIALOG_DATA);

  public page: string;

  ngOnInit(): void {
    this.page = this.data.page;
  }

  close(): void {
    this.dialogRef.close();
  }
}
