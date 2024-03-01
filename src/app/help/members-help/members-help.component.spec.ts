import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MembersHelpComponent } from './members-help.component';

describe('MembersHelpComponent', () => {
  let component: MembersHelpComponent;
  let fixture: ComponentFixture<MembersHelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MembersHelpComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(MembersHelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
