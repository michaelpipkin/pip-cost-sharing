import { NgModule } from '@angular/core';
import { MatCommonModule } from '@angular/material/core';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSortModule } from '@angular/material/sort';
import { MatToolbarModule } from '@angular/material/toolbar';

@NgModule({
  imports: [
    MatCommonModule,
    MatDatepickerModule,
    MatDividerModule,
    MatIconModule,
    MatNativeDateModule,
    MatSidenavModule,
    MatSortModule,
    MatToolbarModule,
  ],
  exports: [
    MatCommonModule,
    MatDatepickerModule,
    MatDividerModule,
    MatIconModule,
    MatNativeDateModule,
    MatSidenavModule,
    MatSortModule,
    MatToolbarModule,
  ],
})
export class MaterialModule {}
