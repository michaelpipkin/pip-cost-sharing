import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { LoadingComponent } from './loading.component';
import { LoadingService } from './loading.service';
import { AnalyticsService } from '@services/analytics.service';
import {
  createMockLoadingService,
  createMockAnalyticsService,
} from '@testing/test-helpers';

describe('LoadingComponent', () => {
  let fixture: ComponentFixture<LoadingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoadingComponent],
      providers: [
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoadingComponent);
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });
});
