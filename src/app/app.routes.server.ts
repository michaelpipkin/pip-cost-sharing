import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'home', renderMode: RenderMode.Prerender },
  { path: 'about', renderMode: RenderMode.Prerender },
  { path: 'help', renderMode: RenderMode.Prerender },
  { path: 'split', renderMode: RenderMode.Prerender },
  { path: 'auth/login', renderMode: RenderMode.Prerender },
  { path: 'auth/register', renderMode: RenderMode.Prerender },
  // All other routes (authed, dynamic) served as client-side SPA shell
  { path: '**', renderMode: RenderMode.Client },
];
