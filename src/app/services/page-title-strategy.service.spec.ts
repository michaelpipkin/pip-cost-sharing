import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { PageTitleStrategyService } from './page-title-strategy.service';

describe('PageTitleStrategyService', () => {
  let service: PageTitleStrategyService;
  let titleService: Title;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PageTitleStrategyService, Title, provideRouter([])],
    });
    service = TestBed.inject(PageTitleStrategyService);
    titleService = TestBed.inject(Title);
  });

  it('should set title with "PipSplit | " prefix when a title is found', () => {
    vi.spyOn(service as any, 'buildTitle').mockReturnValue('Expenses');
    const setTitleSpy = vi.spyOn(titleService, 'setTitle');

    service.updateTitle({} as any);

    expect(setTitleSpy).toHaveBeenCalledWith('PipSplit | Expenses');
  });

  it('should not set title when buildTitle returns undefined', () => {
    vi.spyOn(service as any, 'buildTitle').mockReturnValue(undefined);
    const setTitleSpy = vi.spyOn(titleService, 'setTitle');

    service.updateTitle({} as any);

    expect(setTitleSpy).not.toHaveBeenCalled();
  });

  it('should include the full route title in the page title', () => {
    vi.spyOn(service as any, 'buildTitle').mockReturnValue('History');
    const setTitleSpy = vi.spyOn(titleService, 'setTitle');

    service.updateTitle({} as any);

    expect(setTitleSpy).toHaveBeenCalledWith('PipSplit | History');
  });
});
