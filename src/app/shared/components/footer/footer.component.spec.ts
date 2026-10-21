import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FooterComponent } from './footer.component';
import { MediaQueryService } from '@services/media-query.service';
import { PwaDetectionService } from '@services/pwa-detection.service';
import {
  createMockMediaQueryService,
  createMockPwaDetectionService,
} from '@testing/test-helpers';

describe('FooterComponent', () => {
  let fixture: ComponentFixture<FooterComponent>;
  let mockMediaQuery: ReturnType<typeof createMockMediaQueryService>;

  beforeEach(async () => {
    mockMediaQuery = createMockMediaQueryService();
    await TestBed.configureTestingModule({
      imports: [FooterComponent],
      providers: [
        provideRouter([]),
        { provide: MediaQueryService, useValue: mockMediaQuery },
        {
          provide: PwaDetectionService,
          useValue: createMockPwaDetectionService(),
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FooterComponent);
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should show the version on wider screens', () => {
    const component = fixture.componentInstance;

    expect(component.versionText()).toBe(`${component.version()} | `);
  });

  it('should drop the version on very narrow screens', () => {
    mockMediaQuery.state.set(true);

    expect(fixture.componentInstance.versionText()).toBe('');
  });
});
