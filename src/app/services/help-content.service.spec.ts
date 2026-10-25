import { describe, it, expect } from 'vitest';
import { HelpContentService } from './help-content.service';

describe('HelpContentService', () => {
  const service = new HelpContentService();

  const knownIds = [
    'groups',
    'members',
    'categories',
    'expenses',
    'add-edit-expenses',
    'scan-receipt',
    'vacation-rental',
    'memorized-expenses',
    'add-edit-memorized',
    'summary',
    'history',
    'history-detail',
    'split',
    'cant-verify-device',
  ];

  describe('getHelpSection', () => {
    it('should return a section for each known id', () => {
      for (const id of knownIds) {
        const section = service.getHelpSection(id);
        expect(section).toBeDefined();
        expect(section!.id).toBe(id);
      }
    });

    it('should return undefined for an unknown id', () => {
      expect(service.getHelpSection('nonexistent')).toBeUndefined();
    });

    it('should return undefined for an empty string', () => {
      expect(service.getHelpSection('')).toBeUndefined();
    });

    it('each section should have a non-empty title and at least one content item', () => {
      for (const id of knownIds) {
        const section = service.getHelpSection(id)!;
        expect(section.title.length).toBeGreaterThan(0);
        expect(section.content.length).toBeGreaterThan(0);
      }
    });
  });

  describe('members section', () => {
    const text = () => service.getHelpSection('members')!.content.join(' ');

    it('should explain that a new group email needs confirming, except the login email', () => {
      expect(text()).toContain(
        'Changing your group email to your login email takes effect right away.'
      );
      expect(text()).toContain('we email a confirmation link to that address');
      expect(text()).toContain('the link expires after 24 hours');
    });

    it('should explain that admins can add someone by any verified address', () => {
      expect(text()).toContain(
        "Your verified email addresses are your login email (including login emails you've used before) and every group email you've confirmed."
      );
      expect(text()).toContain(
        "If the address is one of someone's verified addresses, their account is linked to the new member right away."
      );
    });
  });

  describe('getAllHelpSections', () => {
    it('should return all sections', () => {
      const sections = service.getAllHelpSections();
      expect(sections).toHaveLength(knownIds.length);
    });

    it('should include every known id', () => {
      const sections = service.getAllHelpSections();
      const ids = sections.map((s) => s.id);
      for (const id of knownIds) {
        expect(ids).toContain(id);
      }
    });
  });
});
