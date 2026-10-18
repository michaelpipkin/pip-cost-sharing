import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogClose } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { UpdatePromptDialogComponent } from './update-prompt-dialog.component';

describe('UpdatePromptDialogComponent', () => {
  let fixture: ComponentFixture<UpdatePromptDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdatePromptDialogComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(UpdatePromptDialogComponent);
    await fixture.whenStable();
  });

  const closeResult = (testId: string) =>
    fixture.debugElement
      .query(By.css(`[data-testid="${testId}"]`))
      .injector.get(MatDialogClose, null)?.dialogResult;

  it('renders the title', () => {
    const title = fixture.nativeElement.querySelector(
      '[data-testid="update-prompt-title"]'
    );
    expect(title?.textContent?.trim()).toBe('Update PipSplit');
  });

  it('closes with true for Update and false for Not now', () => {
    expect(closeResult('update-prompt-update-button')).toBe(true);
    expect(closeResult('update-prompt-later-button')).toBe(false);
  });
});
