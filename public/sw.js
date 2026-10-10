// Aluvia service worker: shows Web Push notices (ADR 0007) and reports when one is opened, which
// is what "read" means: it keeps the notice's SMS or WhatsApp fallback from going out.
// Plain script, served as-is from /sw.js so its scope is the whole app.

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const notice = event.data.json();
  event.waitUntil(
    self.registration.showNotification(notice.title, {
      body: notice.body,
      icon: "/icon.svg",
      tag: notice.id,
      data: { id: notice.id, url: notice.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { id, url } = event.notification.data ?? {};
  event.waitUntil(
    Promise.all([
      // If this fails the fallback may still go out; opening the page matters more.
      id ? fetch(`/api/v1/notifications/${id}/read`, { method: "POST" }).catch(() => undefined) : undefined,
      url ? self.clients.openWindow(url) : undefined,
    ]),
  );
});
