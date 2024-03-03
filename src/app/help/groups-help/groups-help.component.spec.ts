import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GroupsHelpComponent } from './groups-help.component';

describe('GroupsHelpComponent', () => {
  let component: GroupsHelpComponent;
  let fixture: ComponentFixture<GroupsHelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [GroupsHelpComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(GroupsHelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
