import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { HelpDialogComponent } from './help-dialog.component';
import { HelpContentService } from '@services/help-content.service';

describe('HelpDialogComponent', () => {
  let fixture: ComponentFixture<HelpDialogComponent>;

  const mockHelpContentService = {
    getHelpSection: vi.fn(() => ({
      id: 'groups',
      title: 'Groups',
      content: ['Help content here.'],
    })),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HelpDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: { sectionId: 'groups' } },
        { provide: HelpContentService, useValue: mockHelpContentService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HelpDialogComponent);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });
});
