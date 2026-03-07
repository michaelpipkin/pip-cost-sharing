import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { AccountMenuComponent } from './account-menu.component';
import { UserStore } from '@store/user.store';
import { UserService } from '@services/user.service';
import { ThemeService } from '@services/theme.service';
import { AnalyticsService } from '@services/analytics.service';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import {
  createMockUserStore,
  createMockAnalyticsService,
  createMockThemeService,
  mockUser,
} from '@testing/test-helpers';

describe('AccountMenuComponent', () => {
  let fixture: ComponentFixture<AccountMenuComponent>;
  let component: AccountMenuComponent;
  let mockUserStore: ReturnType<typeof createMockUserStore>;
  let mockThemeService: ReturnType<typeof createMockThemeService>;
  let mockUserService: {
    logout: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
  };
  let translateService: TranslateService;

  beforeEach(async () => {
    mockUserStore = createMockUserStore();
    mockThemeService = createMockThemeService();
    mockUserService = {
      logout: vi.fn(),
      updateUser: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [AccountMenuComponent, TranslateModule.forRoot()],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: UserStore, useValue: mockUserStore },
        { provide: UserService, useValue: mockUserService },
        { provide: ThemeService, useValue: mockThemeService },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    translateService = TestBed.inject(TranslateService);

    fixture = TestBed.createComponent(AccountMenuComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('currentLanguage', () => {
    it('should return English config when user has no language set', () => {
      mockUserStore.user.set(mockUser());
      expect(component.currentLanguage.code).toBe('en');
    });

    it('should return English config when user has en language', () => {
      mockUserStore.user.set(mockUser({ language: 'en' } as any));
      expect(component.currentLanguage.code).toBe('en');
    });

    it('should default to first language when user language not found', () => {
      mockUserStore.user.set(mockUser({ language: 'unknown' } as any));
      expect(component.currentLanguage).toBe(component.languages[0]);
    });
  });

  describe('switchTheme', () => {
    it('should call themeService.setTheme with the given theme', () => {
      component.switchTheme('dark');
      expect(mockThemeService.setTheme).toHaveBeenCalledWith('dark');
    });

    it('should call themeService.setTheme with light theme', () => {
      component.switchTheme('light');
      expect(mockThemeService.setTheme).toHaveBeenCalledWith('light');
    });
  });

  describe('logout', () => {
    it('should call userService.logout', () => {
      component.logout();
      expect(mockUserService.logout).toHaveBeenCalled();
    });

    it('should emit menuClosed', () => {
      let emitCount = 0;
      component.menuClosed.subscribe(() => emitCount++);
      component.logout();
      expect(emitCount).toBe(1);
    });
  });

  describe('switchLanguage', () => {
    it('should call translate.use with langCode', async () => {
      const useSpy = vi
        .spyOn(translateService, 'use')
        .mockReturnValue({} as any);
      await component.switchLanguage('en');
      expect(useSpy).toHaveBeenCalledWith('en');
    });

    it('should call userService.updateUser with language', async () => {
      vi.spyOn(translateService, 'use').mockReturnValue({} as any);
      await component.switchLanguage('en');
      expect(mockUserService.updateUser).toHaveBeenCalledWith({
        language: 'en',
      });
    });
  });
});
