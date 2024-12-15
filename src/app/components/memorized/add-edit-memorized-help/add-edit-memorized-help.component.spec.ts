import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddEditMemorizedHelpComponent } from './add-edit-memorized-help.component';

describe('AddEditMemorizedHelpComponent', () => {
  let component: AddEditMemorizedHelpComponent;
  let fixture: ComponentFixture<AddEditMemorizedHelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddEditMemorizedHelpComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddEditMemorizedHelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
