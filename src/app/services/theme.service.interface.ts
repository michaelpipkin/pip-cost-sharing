export interface IThemeService {
  toggleTheme(): void;
  setTheme(theme: 'light' | 'dark'): void;
}
