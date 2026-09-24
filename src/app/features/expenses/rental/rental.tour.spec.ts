import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRentalTourSteps, RentalTourHooks } from './rental.tour';

describe('buildRentalTourSteps', () => {
  let hooks: { [K in keyof RentalTourHooks]: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    hooks = {
      loadSample: vi.fn(),
      showRooms: vi.fn(),
    };
  });

  const build = () => buildRentalTourSteps(hooks as RentalTourHooks);
  const step = (id: string) => build().find((s) => s.id === id)!;

  it('should walk the rental, the grid, room rates, and continuing', () => {
    expect(build().map((s) => s.id)).toEqual([
      'intro',
      'basics',
      'people',
      'nights',
      'rooms',
      'rooms-grid',
      'continue',
    ]);
  });

  it('should load the sample on the first step', async () => {
    await step('intro').beforeShow!();
    expect(hooks.loadSample).toHaveBeenCalledOnce();
  });

  it('should turn room rates on only for the room steps', async () => {
    for (const id of ['rooms', 'rooms-grid']) {
      hooks.showRooms.mockClear();
      await step(id).beforeShow!();
      expect(hooks.showRooms, id).toHaveBeenCalledWith(true);
    }
    for (const id of ['intro', 'basics', 'people', 'nights', 'continue']) {
      hooks.showRooms.mockClear();
      await step(id).beforeShow!();
      expect(hooks.showRooms, id).toHaveBeenCalledWith(false);
    }
  });
});
