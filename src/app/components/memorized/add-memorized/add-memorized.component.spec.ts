import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddMemorizedComponent } from './add-memorized.component';

describe('AddMemorizedComponent', () => {
  let component: AddMemorizedComponent;
  let fixture: ComponentFixture<AddMemorizedComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddMemorizedComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddMemorizedComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
