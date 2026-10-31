'use strict';

/* Service Worker do "Concentração e Foco".
   Estratégia: rede primeiro, cache como reserva. Online, o usuário sempre
   recebe a versão mais nova dos arquivos (importante enquanto o projeto
   ainda muda); offline, o app abre com a última versão que foi guardada.
   Para forçar a limpeza do cache antigo, basta mudar o número em CACHE. */
const CACHE = 'foco-v1';

const APP_SHELL = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    // Só trata GET do próprio site; o resto passa direto.
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response && response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE).then((cache) => cache.put(request, copy));
                }
                return response;
            })
            .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
});

/* Clicar na notificação traz o app para a frente (ou abre, se estiver fechado). */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
            if (windows.length) return windows[0].focus();
            return self.clients.openWindow('./');
        })
    );
});
