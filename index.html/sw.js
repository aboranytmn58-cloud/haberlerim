// Çok basit bir service worker: hiçbir şeyi önbelleğe almaz,
// her isteği normal şekilde internetten alır. Amaç sadece
// tarayıcının uygulamayı "yüklenebilir" olarak tanımasını sağlamak.
self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (olay) {
  olay.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function () {
  // Bilerek boş: istekler olduğu gibi ağdan geçer.
});
