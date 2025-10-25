import { Component, inject, output, Signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router, RouterLink } from '@angular/router';
import { ROUTE_PATHS } from '@constants/routes.constants';
import { User } from '@models/user';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ThemeService } from '@services/theme.service';
import { UserService } from '@services/user.service';
import { UserStore } from '@store/user.store';
import { getAnalytics, logEvent } from 'firebase/analytics';

interface Language {
  code: string;
  name: string;
  flag: string;
}

@Component({
  selector: 'app-account-menu',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    TranslateModule,
    RouterLink,
  ],
  templateUrl: './account-menu.component.html',
  styleUrl: './account-menu.component.scss',
})
export class AccountMenuComponent {
  protected readonly router = inject(Router);
  protected readonly userStore = inject(UserStore);
  protected readonly userService = inject(UserService);
  protected readonly themeService = inject(ThemeService);
  protected readonly translate = inject(TranslateService);
  protected readonly analytics = inject(getAnalytics);

  readonly routes = ROUTE_PATHS;

  currentUser: Signal<User> = this.userStore.user;
  currentTheme = this.themeService.currentTheme;
  menuClosed = output<void>();

  languages: Language[] = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    // Add more languages as needed
  ];

  get currentLanguage(): Language {
    const langCode = this.currentUser()?.language || 'en';
    return this.languages.find((l) => l.code === langCode) || this.languages[0];
  }

  async switchLanguage(langCode: string): Promise<void> {
    this.translate.use(langCode);
    try {
      await this.userService.updateUser({ language: langCode });
      logEvent(this.analytics, 'language_changed', { language: langCode });
    } catch (error) {
      logEvent(this.analytics, 'error', {
        component: this.constructor.name,
        action: 'switch_language',
        message: error.message,
      });
    }
  }

  switchTheme(theme: 'light' | 'dark'): void {
    this.themeService.setTheme(theme);
  }

  logout(): void {
    this.userService.logout();
    this.menuClosed.emit();
  }
}
