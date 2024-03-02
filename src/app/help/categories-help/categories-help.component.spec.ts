import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CategoriesHelpComponent } from './categories-help.component';

describe('CategoriesHelpComponent', () => {
  let component: CategoriesHelpComponent;
  let fixture: ComponentFixture<CategoriesHelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CategoriesHelpComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CategoriesHelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
