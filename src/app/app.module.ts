import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { AngularFireModule } from '@angular/fire/compat';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { TitleStrategy } from '@angular/router';
import { AuthInterceptor } from '@services/auth.interceptor';
import { PageTitleStrategyService } from '@services/page-title-strategy.service';
import { LoadingService } from '@shared/loading/loading.service';
import { ActiveInactivePipe } from '@shared/pipes/active-inactive.pipe';
import { CurrencyPipe } from '@shared/pipes/currency.pipe';
import { YesNoPipe } from '@shared/pipes/yes-no.pipe';
import { environment } from 'src/environments/environment';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LoginComponent } from './auth/login/login.component';
import { ProfileComponent } from './auth/profile/profile.component';
import { AddCategoryComponent } from './categories/add-category/add-category.component';
import { CategoriesComponent } from './categories/categories/categories.component';
import { EditCategoryComponent } from './categories/edit-category/edit-category.component';
import { AddExpenseComponent } from './expenses/add-expense/add-expense.component';
import { EditExpenseComponent } from './expenses/edit-expense/edit-expense.component';
import { ExpensesComponent } from './expenses/expenses/expenses.component';
import { MemorizedComponent } from './expenses/memorized/memorized.component';
import { SummaryComponent } from './expenses/summary/summary.component';
import { AddGroupComponent } from './groups/add-group/add-group.component';
import { GroupsComponent } from './groups/groups/groups.component';
import { JoinGroupComponent } from './groups/join-group/join-group.component';
import { ManageGroupsComponent } from './groups/manage-groups/manage-groups.component';
import { HelpComponent } from './help/help/help.component';
import { MaterialModule } from './material.module';
import { EditMemberComponent } from './members/edit-member/edit-member.component';
import { MembersComponent } from './members/members/members.component';
import { ConfirmDialogComponent } from './shared/confirm-dialog/confirm-dialog.component';
import { DeleteDialogComponent } from './shared/delete-dialog/delete-dialog.component';
import { FooterComponent } from './shared/footer/footer.component';
import { LoadingComponent } from './shared/loading/loading.component';
import {
  AngularFireAnalytics,
  AngularFireAnalyticsModule,
} from '@angular/fire/compat/analytics';
import {
  MAT_SNACK_BAR_DEFAULT_OPTIONS,
  MatSnackBarConfig,
} from '@angular/material/snack-bar';
import {
  MAT_DIALOG_DEFAULT_OPTIONS,
  MatDialogConfig,
} from '@angular/material/dialog';
import {
  AngularFireAuthModule,
  USE_EMULATOR as USE_AUTH_EMULATOR,
} from '@angular/fire/compat/auth';
import {
  AngularFirestoreModule,
  USE_EMULATOR as USE_FIRESTORE_EMULATOR,
} from '@angular/fire/compat/firestore';
import {
  AngularFireStorageModule,
  USE_EMULATOR as USE_STORAGE_EMULATOR,
} from '@angular/fire/compat/storage';
import {
  ScreenTrackingService,
  UserTrackingService,
} from '@angular/fire/analytics';

@NgModule({
  declarations: [
    AppComponent,
    GroupsComponent,
    AddExpenseComponent,
    LoadingComponent,
    LoginComponent,
    ProfileComponent,
    AddGroupComponent,
    JoinGroupComponent,
    MembersComponent,
    ExpensesComponent,
    CategoriesComponent,
    AddCategoryComponent,
    EditCategoryComponent,
    YesNoPipe,
    CurrencyPipe,
    EditMemberComponent,
    ActiveInactivePipe,
    DeleteDialogComponent,
    EditExpenseComponent,
    SummaryComponent,
    ConfirmDialogComponent,
    HelpComponent,
    FooterComponent,
    MemorizedComponent,
    ManageGroupsComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    MaterialModule,
    AngularFireModule.initializeApp(environment.firebase),
    AngularFireAnalyticsModule,
    AngularFirestoreModule,
    AngularFireAuthModule,
    AngularFireStorageModule,
    FormsModule,
    ReactiveFormsModule,
  ],
  providers: [
    {
      provide: TitleStrategy,
      useClass: PageTitleStrategyService,
    },
    {
      provide: MAT_DIALOG_DEFAULT_OPTIONS,
      useValue: {
        disableClose: true,
        autoFocus: true,
      } as MatDialogConfig,
    },
    {
      provide: MAT_SNACK_BAR_DEFAULT_OPTIONS,
      useValue: {
        verticalPosition: 'top',
        duration: 5000,
      } as MatSnackBarConfig,
    },
    {
      provide: USE_FIRESTORE_EMULATOR,
      useValue: environment.useEmulators ? ['localhost', 8080] : undefined,
    },
    {
      provide: USE_AUTH_EMULATOR,
      useValue: environment.useEmulators
        ? ['http://localhost:9099']
        : undefined,
    },
    {
      provide: USE_STORAGE_EMULATOR,
      useValue: environment.useEmulators ? ['localhost', 9199] : undefined,
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true,
    },
    LoadingService,
    AngularFireAnalytics,
    ScreenTrackingService,
    UserTrackingService,
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
