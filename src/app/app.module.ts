import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { AngularFireModule } from '@angular/fire/compat';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { AuthInterceptor } from '@services/auth.interceptor';
import { LoadingService } from '@shared/loading/loading.service';
import { environment } from 'src/environments/environment';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LoginComponent } from './auth/login/login.component';
import { ProfileComponent } from './auth/profile/profile.component';
import { AddExpenseComponent } from './expenses/add-expense/add-expense.component';
import { ExpensesComponent } from './expenses/expenses/expenses.component';
import { AddGroupComponent } from './groups/add-group/add-group.component';
import { GroupsComponent } from './groups/groups/groups.component';
import { JoinGroupComponent } from './groups/join-group/join-group.component';
import { MaterialModule } from './material.module';
import { MembersComponent } from './members/members/members.component';
import { LoadingComponent } from './shared/loading/loading.component';
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
import { CategoriesComponent } from './categories/categories/categories.component';
import { AddCategoryComponent } from './categories/add-category/add-category.component';
import { EditCategoryComponent } from './categories/edit-category/edit-category.component';

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
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    MaterialModule,
    AngularFireModule.initializeApp(environment.firebase),
    AngularFirestoreModule,
    AngularFireAuthModule,
    AngularFireStorageModule,
    FormsModule,
    ReactiveFormsModule,
  ],
  providers: [
    {
      provide: MAT_DIALOG_DEFAULT_OPTIONS,
      useValue: {
        disableClose: true,
        autoFocus: true,
        width: '400px',
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
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
