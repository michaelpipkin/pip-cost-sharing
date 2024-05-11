import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JoinGroupComponent } from './join-group.component';

describe('JoinGroupComponent', () => {
  let component: JoinGroupComponent;
  let fixture: ComponentFixture<JoinGroupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JoinGroupComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(JoinGroupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
