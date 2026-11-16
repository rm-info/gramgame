// Tests : node --experimental-strip-types src/lib/push/logic.test.ts
import assert from 'node:assert/strict';
import { reminderSchedule, notificationContent, pendingNow, localDate, localTime, type EvalLite } from './logic.ts';

const TZ = 'Europe/Paris';
const at = (iso: string) => Date.parse(iso);
const ev = (o: Partial<EvalLite>): EvalLite => ({
	id: 'e1',
	title: 'Contrôle',
	state: 'open',
	status: 'todo',
	opens_at: null,
	closes_at: null,
	time_limit_min: 0,
	reminders: true,
	...o
});

assert.equal(localDate(at('2026-11-16T23:30:00Z'), TZ), '2026-11-17', 'minuit passé à Paris');
assert.equal(localTime(at('2026-11-16T16:30:00Z'), TZ), '17:30');

const morning = at('2026-11-16T08:00:00Z'); // 9 h à Paris
const evening = at('2026-11-16T19:00:00Z'); // 20 h

// Rien à faire
assert.equal(reminderSchedule([], TZ, morning), null);
assert.equal(reminderSchedule([ev({ status: 'submitted' })], TZ, morning), null);
assert.equal(reminderSchedule([ev({ state: 'closed', status: 'missed' })], TZ, morning), null);
assert.equal(reminderSchedule([ev({ reminders: false })], TZ, morning), null, 'rappels coupés par le prof');
assert.equal(reminderSchedule([ev({ status: 'in_progress', time_limit_min: 20 })], TZ, morning), null, 'épreuve chronométrée commencée');

// Ouverte, sans fin : tous les jours à 17 h 30, sans date
assert.deepEqual(reminderSchedule([ev({})], TZ, morning), { type: 'daily', time: '17:30', tz: TZ });
assert.deepEqual(reminderSchedule([ev({ status: 'in_progress' })], TZ, morning), { type: 'daily', time: '17:30', tz: TZ }, 'commencée sans limite');

// Fin le 20 à 18 h : dernier rappel le 20 ; fin le 20 à 8 h : dernier rappel le 19
assert.deepEqual(reminderSchedule([ev({ closes_at: '2026-11-20 17:00:00.000Z' })], TZ, morning), { type: 'daily', time: '17:30', tz: TZ, until: '2026-11-20' });
assert.deepEqual(reminderSchedule([ev({ closes_at: '2026-11-20 07:00:00.000Z' })], TZ, morning), { type: 'daily', time: '17:30', tz: TZ, until: '2026-11-19' });
// Fin ce soir à 19 h, il est 20 h : plus rien
assert.equal(reminderSchedule([ev({ closes_at: '2026-11-16 18:00:00.000Z' })], TZ, evening), null);
// Fin demain 8 h, il est 20 h : le rappel de demain 17 h 30 serait trop tard
assert.equal(reminderSchedule([ev({ closes_at: '2026-11-17 07:00:00.000Z' })], TZ, evening), null);

// Plusieurs évaluations : jusqu'à la dernière fin ; une sans fin → pas de fin
const two = [ev({ id: 'a', closes_at: '2026-11-18 20:00:00.000Z' }), ev({ id: 'b', closes_at: '2026-11-25 20:00:00.000Z' })];
assert.equal(reminderSchedule(two, TZ, morning)?.until, '2026-11-25');
assert.equal(reminderSchedule([...two, ev({ id: 'c' })], TZ, morning)?.until, undefined);

// À venir seulement : commence le jour de l'ouverture (ou le lendemain si elle ouvre après 17 h 30)
assert.deepEqual(reminderSchedule([ev({ state: 'upcoming', opens_at: '2026-11-19 07:00:00.000Z' })], TZ, morning), { type: 'daily', time: '17:30', tz: TZ, start: '2026-11-19' });
assert.equal(reminderSchedule([ev({ state: 'upcoming', opens_at: '2026-11-19 18:00:00.000Z' })], TZ, morning)?.start, '2026-11-20');
// Une ouverte + une à venir : tout de suite
assert.equal(reminderSchedule([ev({}), ev({ id: 'u', state: 'upcoming', opens_at: '2026-11-19 07:00:00.000Z' })], TZ, morning)?.start, undefined);

// Texte
assert.equal(notificationContent([ev({ status: 'submitted' })], morning, TZ), null);
let n = notificationContent([ev({ id: 'x1', title: 'Contrôle P1' })], morning, TZ);
assert.deepEqual(n, { title: '📝 Une évaluation à faire', body: "« Contrôle P1 » t'attend sur GramGame.", url: '/evaluations/x1/passer' });
n = notificationContent([ev({ id: 'a', title: 'A' }), ev({ id: 'b', title: 'B', closes_at: '2026-11-16 20:00:00.000Z' }), ev({ id: 'c', title: 'C', state: 'upcoming' })], morning, TZ, 'tom');
assert.deepEqual(n, { title: '📝 2 évaluations à faire (tom)', body: '« A », « B ». Dernier jour pour « B » !', url: '/evaluations' });
assert.equal(pendingNow([ev({ state: 'upcoming' })]).length, 0);

console.log('rappels push : OK');
