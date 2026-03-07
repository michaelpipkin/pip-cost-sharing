import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthMainComponent } from './auth-main.component';

describe('AuthMainComponent', () => {
  let fixture: ComponentFixture<AuthMainComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthMainComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AuthMainComponent);
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });
});
