// @ts-nocheck
// Copie du client du serveur PUSH (https://push.lab.rm-info.fr/push-client.js),
// à garder telle quelle (mettre à jour en recopiant la nouvelle version).

// PUSH client — reusable, dependency-free (ES module).
//
//   const push = new PushClient({ baseUrl, appKey, registration, storage });
//   await push.enable();                 // inside a click handler!
//   await push.putReminder(id, { type: 'daily', time: '08:00', tz: PushClient.timeZone() });
//
// `storage` persists { token, endpoint, ... } (default: localStorage). Use
// IndexedDB if your service worker must read it (pushsubscriptionchange).

export class PushError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

const localStorageAdapter = (key = 'push-client') => ({
  async get() { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (_) { return {}; } },
  async set(v) { localStorage.setItem(key, JSON.stringify(v)); },
});

export class PushClient {
  constructor({ baseUrl, appKey, registration, storage = localStorageAdapter() }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.appKey = appKey;
    this.registration = registration;
    this.storage = storage;
  }

  static timeZone() { return Intl.DateTimeFormat().resolvedOptions().timeZone; }

  static isSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  // iOS only allows Web Push for PWAs added to the home screen.
  static isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  }

  async vapidKey() {
    const r = await fetch(`${this.baseUrl}/v1/vapid-public-key`);
    if (!r.ok) throw new PushError(r.status, 'vapid_key', 'cannot fetch VAPID key');
    return (await r.json()).publicKey;
  }

  // Ask permission (MUST be called from a user gesture), subscribe and
  // register the device. Returns { reset } — see sync().
  async enable() {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new PushError(0, 'permission_denied', `notification permission: ${perm}`);
    return this.sync({ subscribeIfMissing: true });
  }

  // Call on every app start. Makes sure the server knows the current
  // subscription. If `reset` is true the server had forgotten this device
  // (expired subscription, data wiped...): push your full reminder list
  // again with replaceReminders().
  async sync({ subscribeIfMissing = false } = {}) {
    const cfg = await this.storage.get();
    let sub = await this.registration.pushManager.getSubscription();
    if (!sub) {
      if (!subscribeIfMissing && Notification.permission !== 'granted') return { enabled: false, reset: false };
      const vapidKey = await this.vapidKey();
      sub = await this.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey });
      cfg.vapidKey = vapidKey;
    }
    const body = JSON.stringify(sub.toJSON());
    if (cfg.token && cfg.endpoint === sub.endpoint) {
      // Cheap check that the server still knows us.
      try { await this.listReminders(); return { enabled: true, reset: false }; }
      catch (e) { if (e.status !== 401) throw e; }
    } else if (cfg.token) {
      try {
        await this.#call('PUT', '/v1/subscription', body);
        await this.storage.set({ ...cfg, endpoint: sub.endpoint });
        return { enabled: true, reset: false };
      } catch (e) { if (e.status !== 401 && e.status !== 409) throw e; }
    }
    const res = await this.#call('POST', '/v1/subscriptions', body, false);
    await this.storage.set({ ...cfg, token: res.token, endpoint: sub.endpoint });
    return { enabled: true, reset: true };
  }

  putReminder(id, schedule) {
    return this.#call('PUT', `/v1/reminders/${encodeURIComponent(id)}`, JSON.stringify({ schedule }));
  }

  async deleteReminder(id) {
    try { await this.#call('DELETE', `/v1/reminders/${encodeURIComponent(id)}`); }
    catch (e) { if (e.status !== 404) throw e; }
  }

  async listReminders() { return (await this.#call('GET', '/v1/reminders')).reminders; }

  // Replace everything the server holds for this device: [{ id, schedule }].
  async replaceReminders(list) {
    return (await this.#call('PUT', '/v1/reminders', JSON.stringify({ reminders: list }))).reminders;
  }

  // Forget this device server-side and unsubscribe from push.
  async disable() {
    try { await this.#call('DELETE', '/v1/subscription'); } catch (e) { if (e.status !== 401) throw e; }
    const sub = await this.registration.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    const cfg = await this.storage.get();
    delete cfg.token; delete cfg.endpoint;
    await this.storage.set(cfg);
  }

  async #call(method, path, body, withToken = true) {
    const headers = { 'X-App-Key': this.appKey };
    if (body) headers['Content-Type'] = 'application/json';
    if (withToken) {
      const { token } = await this.storage.get();
      if (!token) throw new PushError(401, 'no_token', 'device not registered: call enable() first');
      headers.Authorization = `Bearer ${token}`;
    }
    const r = await fetch(this.baseUrl + path, { method, headers, body });
    if (r.status === 204) return null;
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new PushError(r.status, data.error, data.message);
    return data;
  }
}
