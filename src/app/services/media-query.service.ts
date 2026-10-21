import { Injectable, Signal, signal } from '@angular/core';

/**
 * Signal-based CSS media queries, in place of the CDK BreakpointObserver
 * (an RxJS Observable). Each distinct query gets one MediaQueryList listener
 * for the life of the app, shared by every caller, so components need no
 * subscription or teardown.
 */
@Injectable({ providedIn: 'root' })
export class MediaQueryService {
  readonly #queries = new Map<string, Signal<boolean>>();

  /**
   * Whether `query` currently matches. A comma-separated list matches when
   * any of its queries does (e.g. '(max-width: 600px), (max-height: 700px)').
   */
  matches(query: string): Signal<boolean> {
    let matches = this.#queries.get(query);
    if (!matches) {
      matches = this.#watch(query);
      this.#queries.set(query, matches);
    }
    return matches;
  }

  #watch(query: string): Signal<boolean> {
    // No matchMedia outside a browser (e.g. jsdom in unit tests): never match,
    // as the CDK's MediaMatcher does.
    if (typeof globalThis.matchMedia !== 'function') {
      return signal(false).asReadonly();
    }
    const list = globalThis.matchMedia(query);
    const matches = signal(list.matches);
    list.addEventListener('change', (event) => matches.set(event.matches));
    return matches.asReadonly();
  }
}
