import { readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Emits dist/sw.js with a precache list of every built file, so the whole app
 * works offline after the first visit. The cache name is a hash of the file
 * list: a new build produces a new cache and the old one is deleted.
 */
function serviceWorker(): Plugin {
  return {
    name: 'tambola-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const publicFiles = readdirSync('public');
      const files = ['./', ...[...Object.keys(bundle), ...publicFiles].map((f) => `./${f}`)];
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
      const source = `// Generated at build time. Cache-first, offline-ready.
const CACHE = 'tambola-${version}';
const ASSETS = ${JSON.stringify(files)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tambola-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    // ignoreVary: hosts often send "Vary: Origin", and module scripts are
    // requested with an Origin header that the precache requests did not have.
    caches.match(request, { ignoreVary: true, ignoreSearch: request.mode === 'navigate' }).then(
      (cached) =>
        cached ||
        fetch(request).catch(() =>
          request.mode === 'navigate' ? caches.match('./').then((r) => r ?? Response.error()) : Response.error(),
        ),
    ),
  );
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Relative base so the build works from any folder or sub-path on a static host.
  base: './',
  plugins: [serviceWorker()],
  build: { target: 'es2020' },
  // e2e test QR6 serves the preview under a public-looking host name.
  preview: { allowedHosts: ['tambola.example'] },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
