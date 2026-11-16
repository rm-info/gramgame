// Petit stockage IndexedDB partagé entre l'app et le service worker (qui n'a
// pas accès à localStorage). Rien de ce qui est ici n'est envoyé au serveur PUSH.
//   kv        : réglages (client PUSH, jeton du compte pour relire les évaluations…)
//   reminders : un rappel par compte élève { id, userId, username, schedule }

const DB_NAME = 'gramgame-push';
const VERSION = 1;

export interface LocalReminder {
	/** Identifiant opaque envoyé au serveur PUSH (aléatoire). */
	id: string;
	userId: string;
	username: string;
	/** Horaire tel qu'envoyé au serveur PUSH. */
	schedule: Record<string, unknown>;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
	if (!dbPromise) {
		dbPromise = new Promise((resolve, reject) => {
			const req = indexedDB.open(DB_NAME, VERSION);
			req.onupgradeneeded = () => {
				const db = req.result;
				if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
				if (!db.objectStoreNames.contains('reminders')) db.createObjectStore('reminders', { keyPath: 'id' });
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => {
				dbPromise = null;
				reject(req.error);
			};
		});
	}
	return dbPromise;
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
	const db = await open();
	return new Promise<T>((resolve, reject) => {
		const tx = db.transaction(store, mode);
		const req = fn(tx.objectStore(store));
		tx.oncomplete = () => resolve(req.result as T);
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error);
	});
}

export const kvGet = <T = unknown>(key: string) => run<T | undefined>('kv', 'readonly', (s) => s.get(key));
export const kvSet = (key: string, value: unknown) => run<IDBValidKey>('kv', 'readwrite', (s) => s.put(value, key));
export const kvDelete = (key: string) => run<undefined>('kv', 'readwrite', (s) => s.delete(key));

export const reminderGet = (id: string) => run<LocalReminder | undefined>('reminders', 'readonly', (s) => s.get(id));
export const reminderPut = (r: LocalReminder) => run<IDBValidKey>('reminders', 'readwrite', (s) => s.put(r));
export const reminderDelete = (id: string) => run<undefined>('reminders', 'readwrite', (s) => s.delete(id));
export const reminderAll = () => run<LocalReminder[]>('reminders', 'readonly', (s) => s.getAll());
export const reminderClear = () => run<undefined>('reminders', 'readwrite', (s) => s.clear());

/** Stockage du client PUSH (jeton de l'appareil), lisible par le service worker. */
export const pushClientStorage = {
	async get(): Promise<Record<string, unknown>> {
		return ((await kvGet<Record<string, unknown>>('push-client')) ?? {}) as Record<string, unknown>;
	},
	async set(v: Record<string, unknown>) {
		await kvSet('push-client', v);
	}
};
