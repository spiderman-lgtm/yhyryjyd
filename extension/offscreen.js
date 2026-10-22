/* global chrome */
// A hidden extension page: service workers cannot read the device location, extension pages can.
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type !== 'offscreen-geo') return false;
  navigator.geolocation.getCurrentPosition(
    (p) => reply({ ok: true, lat: p.coords.latitude, lng: p.coords.longitude }),
    (e) => reply({ ok: false, denied: e.code === e.PERMISSION_DENIED }),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5 * 60_000 },
  );
  return true;
});
