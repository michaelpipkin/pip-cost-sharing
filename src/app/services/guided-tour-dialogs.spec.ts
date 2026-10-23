import { MatDialogRef } from '@angular/material/dialog';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GUIDED_TOUR_DIALOG_CONFIG,
  GuidedTourDialogs,
} from './guided-tour-dialogs';

/**
 * A dialog ref whose afterOpened and afterClosed are fired by the test, with
 * the same shape the helper uses (an object with subscribe).
 */
function fakeRef() {
  const opened: Array<() => void> = [];
  const closed: Array<() => void> = [];
  const close = vi.fn(() => closed.forEach((fn) => fn()));
  const ref = {
    afterOpened: () => ({ subscribe: (fn: () => void) => opened.push(fn) }),
    afterClosed: () => ({ subscribe: (fn: () => void) => closed.push(fn) }),
    close,
  };
  return {
    ref: ref as unknown as MatDialogRef<unknown>,
    close,
    fireOpened: () => opened.forEach((fn) => fn()),
  };
}

describe('GuidedTourDialogs', () => {
  const timers: ReturnType<typeof setTimeout>[] = [];

  afterEach(() => {
    timers.forEach(clearTimeout);
    timers.length = 0;
    vi.restoreAllMocks();
  });

  /** 'resolved' if the promise settles within a few ms, else 'pending'. */
  function settled(promise: Promise<unknown>): Promise<'resolved' | 'pending'> {
    return Promise.race([
      promise.then(() => 'resolved' as const),
      new Promise<'pending'>((resolve) =>
        timers.push(setTimeout(() => resolve('pending'), 20))
      ),
    ]);
  }

  it('should export a config that stops a tour dialog stealing and returning focus', () => {
    expect(GUIDED_TOUR_DIALOG_CONFIG).toEqual({
      autoFocus: false,
      restoreFocus: false,
    });
  });

  describe('open', () => {
    it('should resolve only once afterOpened has fired', async () => {
      const dialogs = new GuidedTourDialogs<'a' | 'b'>();
      const dlg = fakeRef();

      const opening = dialogs.open('a', () => dlg.ref);

      expect(await settled(opening)).toBe('pending');
      dlg.fireOpened();
      expect(await settled(opening)).toBe('resolved');
    });

    it('should not reopen a dialog of the same kind while it is open', async () => {
      const dialogs = new GuidedTourDialogs<'a' | 'b'>();
      const first = fakeRef();
      const second = fakeRef();
      const opening = dialogs.open('a', () => first.ref);
      first.fireOpened();
      await opening;
      const openSecond = vi.fn(() => second.ref);

      const again = dialogs.open('a', openSecond);

      expect(await settled(again)).toBe('resolved');
      expect(openSecond).not.toHaveBeenCalled();
      expect(first.close).not.toHaveBeenCalled();
    });

    it('should close the open dialog once when a different kind is opened', async () => {
      const dialogs = new GuidedTourDialogs<'a' | 'b'>();
      const first = fakeRef();
      const second = fakeRef();
      const openingFirst = dialogs.open('a', () => first.ref);
      first.fireOpened();
      await openingFirst;

      const openingSecond = dialogs.open('b', () => second.ref);
      second.fireOpened();
      await openingSecond;

      expect(first.close).toHaveBeenCalledTimes(1);
      expect(second.close).not.toHaveBeenCalled();
    });

    it('should track the newly opened dialog, so closing again closes it and not the first', async () => {
      const dialogs = new GuidedTourDialogs<'a' | 'b'>();
      const first = fakeRef();
      const second = fakeRef();
      const openingFirst = dialogs.open('a', () => first.ref);
      first.fireOpened();
      await openingFirst;
      const openingSecond = dialogs.open('b', () => second.ref);
      second.fireOpened();
      await openingSecond;

      dialogs.close();

      expect(second.close).toHaveBeenCalledTimes(1);
      expect(first.close).toHaveBeenCalledTimes(1);
    });

    it('should open the same kind again after it was closed', async () => {
      const dialogs = new GuidedTourDialogs<'a'>();
      const first = fakeRef();
      const second = fakeRef();
      const openingFirst = dialogs.open('a', () => first.ref);
      first.fireOpened();
      await openingFirst;
      dialogs.close();

      const openSecond = vi.fn(() => second.ref);
      const openingSecond = dialogs.open('a', openSecond);
      second.fireOpened();
      await openingSecond;

      expect(openSecond).toHaveBeenCalledTimes(1);
    });

    // BUG (B9): guided-tour-dialogs.ts:30-32 - open() waits only on
    // afterOpened(). A dialog closed before its open animation finishes (a
    // quick step change calls close()) never emits afterOpened, so open()
    // never resolves and the tour step awaiting it hangs. It should also stop
    // waiting on afterClosed. Deferred by owner 2026-10-21.
    it.fails(
      'should resolve even if the dialog closes before afterOpened fires',
      async () => {
        const dialogs = new GuidedTourDialogs<'a'>();
        const dlg = fakeRef();

        const opening = dialogs.open('a', () => dlg.ref);
        dialogs.close();

        expect(await settled(opening)).toBe('resolved');
      }
    );
  });

  describe('close', () => {
    it('should close the open dialog', async () => {
      const dialogs = new GuidedTourDialogs<'a'>();
      const dlg = fakeRef();
      const opening = dialogs.open('a', () => dlg.ref);
      dlg.fireOpened();
      await opening;

      dialogs.close();

      expect(dlg.close).toHaveBeenCalledTimes(1);
    });

    it('should be a no-op the second time', async () => {
      const dialogs = new GuidedTourDialogs<'a'>();
      const dlg = fakeRef();
      const opening = dialogs.open('a', () => dlg.ref);
      dlg.fireOpened();
      await opening;

      dialogs.close();
      dialogs.close();

      expect(dlg.close).toHaveBeenCalledTimes(1);
    });

    it('should be a no-op when nothing was ever opened', () => {
      const dialogs = new GuidedTourDialogs<'a'>();

      expect(() => dialogs.close()).not.toThrow();
    });
  });
});
