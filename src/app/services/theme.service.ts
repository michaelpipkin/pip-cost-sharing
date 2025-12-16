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
import { Capacitor } from '@capacitor/core';
import { EdgeToEdge } from '@capawesome/capacitor-android-edge-to-edge-support';
import { SystemBars } from '../plugins/system-bars.plugin';

export type ThemeMode = 'light' | 'dark';

// Primary colors for each theme (from color-tokens.scss)
const THEME_PRIMARY_COLORS: Record<ThemeMode, string> = {
  light: '#105208', // primary level 30
  dark: '#78bc67', // primary level 70
};

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

    // Update Android system bar colors when running as native app
    this.updateSystemBarColors(theme);
  }

  private async updateSystemBarColors(theme: ThemeMode): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') {
      return;
    }

    const primaryColor = THEME_PRIMARY_COLORS[theme];
    await EdgeToEdge.setBackgroundColor({ color: primaryColor });

    // Set status bar icon style based on background color brightness
    // Light theme (dark background) = dark icons param but light visual icons
    // Dark theme (light background) = light icons param but dark visual icons
    // Note: 'light' style = dark icons on light background, 'dark' style = light icons on dark background
    const style = theme === 'light' ? 'dark' : 'light';
    await SystemBars.setStyle({ style });
  }

  private getSavedTheme(): ThemeMode {
    const savedTheme = localStorage.getItem(this.themeKey);
    return (savedTheme as ThemeMode) || 'light';
  }

  private saveTheme(theme: ThemeMode): void {
    localStorage.setItem(this.themeKey, theme);
  }
}
