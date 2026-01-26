import { computed, Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LoadingService {
  #loadingSources = signal<Set<string>>(new Set());
  loading = computed(() => this.#loadingSources().size > 0);

  loadingOn(source: string = 'content') {
    this.#loadingSources.update((sources) => {
      const newSources = new Set(sources);
      newSources.add(source);
      return newSources;
    });
  }

  loadingOff(source: string = 'content') {
    this.#loadingSources.update((sources) => {
      const newSources = new Set(sources);
      newSources.delete(source);
      return newSources;
    });
  }
}
