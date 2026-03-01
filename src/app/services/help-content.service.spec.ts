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
    'memorized-expenses',
    'add-edit-memorized',
    'summary',
    'history',
    'history-detail',
    'split',
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

  describe('getAllHelpSections', () => {
    it('should return all sections', () => {
      const sections = service.getAllHelpSections();
      expect(sections.length).toBe(knownIds.length);
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
