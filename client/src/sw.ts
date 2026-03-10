/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

clientsClaim();
self.skipWaiting();

precacheAndRoute(self.__WB_MANIFEST);

const denylist = [/^\/events(\/|$)/, /^\/graphql(\/|$)/];

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist })
);

registerRoute(
  ({ url }) => url.pathname.startsWith('/events') || url.pathname.startsWith('/graphql'),
  new NetworkOnly()
);

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/events') || url.pathname.startsWith('/graphql')) {
    return;
  }
});
