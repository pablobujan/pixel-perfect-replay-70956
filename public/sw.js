// Service worker mínimo para poder mostrar la notificación de "vuelve al
// Modo Anxo Carro" cuando la app está en segundo plano (móvil, sobre todo).
// No intercepta peticiones ni cachea nada.

const NOTIFICATION_TAG = "anxo-carro-away";
const DEFAULT_TITLE = "¡Vuelve al Modo Anxo Carro!";
const DEFAULT_BODY =
  "Has salido de la app y el cronómetro está en pausa. Vuelve al partido para reactivar el Modo Fan.";

let awayTimer = null;
let awayResolve = null;

const clearAwayTimer = () => {
  if (awayTimer !== null) clearTimeout(awayTimer);
  awayTimer = null;
  if (awayResolve) awayResolve();
  awayResolve = null;
};

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const closeAwayNotification = async () => {
  try {
    const shown = await self.registration.getNotifications({ tag: NOTIFICATION_TAG });
    shown.forEach((notification) => notification.close());
  } catch {
    // Sin notificaciones disponibles: nada que cerrar.
  }
};

// La página avisa al service worker en el mismo instante en que el socio sale.
// El retardo (para no vibrar si solo se apagó la pantalla) se hace aquí, no en
// la pestaña: el navegador puede congelarla nada más ocultarse y entonces el
// temporizador de la página nunca llegaría a mostrar el aviso.
self.addEventListener("message", (event) => {
  const data = event.data || {};

  if (data.type === "schedule-away-notification") {
    if (self.Notification && self.Notification.permission !== "granted") return;
    const delay = Math.max(0, Number(data.delayMs) || 0);

    if (awayTimer !== null) clearAwayTimer();

    event.waitUntil(
      new Promise((resolve) => {
        awayResolve = resolve;
        awayTimer = setTimeout(async () => {
          awayTimer = null;
          awayResolve = null;
          try {
            await self.registration.showNotification(data.title || DEFAULT_TITLE, {
              body: data.body || DEFAULT_BODY,
              icon: "/lugo.png",
              badge: "/lugo.png",
              tag: NOTIFICATION_TAG,
              renotify: true,
              data: { url: "/" },
            });
          } catch {
            // Si el sistema no deja mostrarla, no rompemos nada.
          }
          resolve();
        }, delay);
      }),
    );
    return;
  }

  if (data.type === "cancel-away-notification") {
    clearAwayTimer();
    event.waitUntil(closeAwayNotification());
    return;
  }

  if (data.type !== "show-away-notification") return;

  event.waitUntil(
    self.registration.showNotification(data.title || DEFAULT_TITLE, {
      body: data.body || DEFAULT_BODY,
      icon: "/lugo.png",
      badge: "/lugo.png",
      tag: NOTIFICATION_TAG,
      data: { url: "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow("/");
      }
    })(),
  );
});
