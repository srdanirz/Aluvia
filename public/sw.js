// Aluvia service worker: shows Web Push notices (ADR 0007). The url is the notice's short link,
// which marks it read and redirects, so opening it is all "read" needs.
// Plain script, served as-is from /sw.js so its scope is the whole app.

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const notice = event.data.json();
  event.waitUntil(
    self.registration.showNotification(notice.title, {
      body: notice.body,
      icon: "/icon.svg",
      tag: notice.id,
      data: { url: notice.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  if (url) event.waitUntil(self.clients.openWindow(url));
});
