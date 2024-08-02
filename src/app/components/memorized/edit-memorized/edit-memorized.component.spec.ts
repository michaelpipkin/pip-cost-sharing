import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditMemorizedComponent } from './edit-memorized.component';

describe('EditMemorizedComponent', () => {
  let component: EditMemorizedComponent;
  let fixture: ComponentFixture<EditMemorizedComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditMemorizedComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditMemorizedComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
