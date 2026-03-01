import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { RendererFactory2 } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  const addClassSpy = vi.fn();
  const removeClassSpy = vi.fn();

  const mockRenderer = {
    addClass: addClassSpy,
    removeClass: removeClassSpy,
  };

  const mockRendererFactory = {
    createRenderer: vi.fn(() => mockRenderer),
  };

  function createService(): ThemeService {
    TestBed.configureTestingModule({
      providers: [
        ThemeService,
        { provide: RendererFactory2, useValue: mockRendererFactory },
      ],
    });
    return TestBed.inject(ThemeService);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('web');
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
      }),
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('initial theme', () => {
    it('should default to light theme when no saved preference', () => {
      service = createService();
      expect(service.currentTheme()).toBe('light');
    });

    it('should restore saved dark theme from localStorage', () => {
      localStorage.setItem('app-theme-preference', 'dark');
      service = createService();
      expect(service.currentTheme()).toBe('dark');
    });

    it('should restore saved light theme from localStorage', () => {
      localStorage.setItem('app-theme-preference', 'light');
      service = createService();
      expect(service.currentTheme()).toBe('light');
    });
  });

  describe('setTheme', () => {
    beforeEach(() => {
      service = createService();
    });

    it('should update the currentTheme signal', () => {
      service.setTheme('dark');
      expect(service.currentTheme()).toBe('dark');
    });

    it('should persist the theme to localStorage', () => {
      service.setTheme('dark');
      expect(localStorage.getItem('app-theme-preference')).toBe('dark');
    });

    it('should apply dark-theme class to document body', () => {
      service.setTheme('dark');
      TestBed.flushEffects();
      expect(addClassSpy).toHaveBeenCalledWith(document.body, 'dark-theme');
      expect(removeClassSpy).toHaveBeenCalledWith(document.body, 'light-theme');
    });

    it('should apply light-theme class to document body', () => {
      service.setTheme('light');
      TestBed.flushEffects();
      expect(addClassSpy).toHaveBeenCalledWith(document.body, 'light-theme');
      expect(removeClassSpy).toHaveBeenCalledWith(document.body, 'dark-theme');
    });
  });

  describe('toggleTheme', () => {
    beforeEach(() => {
      service = createService();
    });

    it('should switch from light to dark', () => {
      service.setTheme('light');
      service.toggleTheme();
      expect(service.currentTheme()).toBe('dark');
    });

    it('should switch from dark to light', () => {
      service.setTheme('dark');
      service.toggleTheme();
      expect(service.currentTheme()).toBe('light');
    });

    it('should persist toggled theme to localStorage', () => {
      service.setTheme('light');
      service.toggleTheme();
      expect(localStorage.getItem('app-theme-preference')).toBe('dark');
    });
  });
});
