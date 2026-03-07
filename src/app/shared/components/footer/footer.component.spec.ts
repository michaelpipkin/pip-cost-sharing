import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BreakpointObserver } from '@angular/cdk/layout';
import { FooterComponent } from './footer.component';
import { PwaDetectionService } from '@services/pwa-detection.service';
import { createMockPwaDetectionService } from '@testing/test-helpers';

describe('FooterComponent', () => {
  let fixture: ComponentFixture<FooterComponent>;

  const mockBreakpointObserver = {
    observe: vi.fn(() => ({
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    })),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FooterComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: BreakpointObserver, useValue: mockBreakpointObserver },
        { provide: PwaDetectionService, useValue: createMockPwaDetectionService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FooterComponent);
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });
});
