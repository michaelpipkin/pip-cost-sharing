import { IThemeService } from './theme.service.interface';
import {
  computed,
  effect,
  inject,
  Injectable,
  Renderer2,
  RendererFactory2,
  signal,
} from '@angular/core';

export type ThemeMode = 'light' | 'dark';

@Injectable({
  providedIn: 'root',
})
export class ThemeService implements IThemeService {
  private rendererFactory = inject(RendererFactory2);
  private renderer: Renderer2 = this.rendererFactory.createRenderer(null, null);
  private themeKey = 'app-theme-preference';

  // Create a signal for the current theme
  private _currentTheme = signal<ThemeMode>(this.getSavedTheme());

  // Create a readable computed for external components
  readonly currentTheme = computed(() => this._currentTheme());

  constructor() {
    // Use an effect to apply theme changes
    effect(() => {
      this.applyTheme(this._currentTheme());
    });

    // Listen for system theme preference changes
    if (window.matchMedia) {
      const colorSchemeQuery = window.matchMedia(
        '(prefers-color-scheme: dark)'
      );

      // Set up a listener for changes
      colorSchemeQuery.addEventListener('change', (e) => {
        // Only update if the user hasn't explicitly chosen a theme
        if (!localStorage.getItem(this.themeKey)) {
          this._currentTheme.set(e.matches ? 'dark' : 'light');
        }
      });
    }
  }

  toggleTheme(): void {
    const newTheme = this._currentTheme() === 'light' ? 'dark' : 'light';
    this.setTheme(newTheme);
  }

  setTheme(theme: ThemeMode): void {
    this._currentTheme.set(theme);
    this.saveTheme(theme);
  }

  private applyTheme(theme: ThemeMode): void {
    if (theme === 'dark') {
      this.renderer.addClass(document.body, 'dark-theme');
      this.renderer.removeClass(document.body, 'light-theme');
    } else {
      this.renderer.addClass(document.body, 'light-theme');
      this.renderer.removeClass(document.body, 'dark-theme');
    }
  }

  private getSavedTheme(): ThemeMode {
    const savedTheme = localStorage.getItem(this.themeKey);
    return (savedTheme as ThemeMode) || this.getPreferredTheme();
  }

  private saveTheme(theme: ThemeMode): void {
    localStorage.setItem(this.themeKey, theme);
  }

  private getPreferredTheme(): ThemeMode {
    // Check if user has a system preference
    if (
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
    return 'light';
  }
}
