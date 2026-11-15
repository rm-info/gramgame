const s = require('./load.cjs')('suivi.js');
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('✗', m); } };

ok(s.masteryStatus([]) === 'non_commence', 'non commencé');
ok(s.masteryStatus([1]) === 'en_cours', 'une seule tentative parfaite : en cours');
ok(s.masteryStatus([0.9, 0.85, 0.2]) === 'en_cours', 'moyenne des 3 dernières (65 %) : en cours');
ok(s.masteryStatus([0.9, 0.85, 0.8, 0.1]) === 'acquis', 'acquis (seules les 3 dernières comptent)');
ok(s.masteryStatus([0.3, 0.4]) === 'a_retravailler', 'à retravailler');

const now = new Date('2026-11-15T12:00:00Z').getTime();
const d = (daysAgo) => new Date(now - daysAgo * 86400000).toISOString().replace('T', ' ');
const rules = { 'on-ont': { name: 'on / ont', category: 'orthographe' }, 'groupe-verbe': { name: "Groupe d'un verbe", category: 'conjugaison' } };
const att = [
  { created: d(1), score: 8, score_total: 10, hard_mode: true, rule: 'on-ont', breakdown: { 'on-ont': { ok: 8, total: 10 } } },
  { created: d(2), score: 9, score_total: 10, hard_mode: false, rule: 'on-ont', breakdown: {} },
  { created: d(3), score: 4, score_total: 10, hard_mode: false, rule: 'groupe-verbe', breakdown: { 'groupe-verbe': { ok: 4, total: 10, groups: { '3e groupe': { ok: 1, total: 5 }, '1er groupe': { ok: 3, total: 5 } } } } },
  { created: d(20), score: 2, score_total: 10, hard_mode: false, rule: 'groupe-verbe', breakdown: { 'groupe-verbe': { ok: 2, total: 10, groups: { '3e groupe': { ok: 0, total: 4 } } } } },
  { created: d(60), score: 10, score_total: 10, hard_mode: false, rule: 'on-ont', breakdown: {} }
];
const st = s.studentStats(att, rules, now);
ok(st.attempts_total === 5 && st.attempts_7d === 3, 'compteurs ' + st.attempts_total + '/' + st.attempts_7d);
ok(st.avg_7d === 70 && st.avg_30d === 58, 'moyennes ' + st.avg_7d + ' / ' + st.avg_30d);
const on = st.notions.find((n) => n.rule_id === 'on-ont');
ok(on.attempts === 3 && on.hard_attempts === 1 && on.last_pct === 80 && on.status === 'acquis', 'notion on/ont ' + JSON.stringify(on));
const gv = st.notions.find((n) => n.rule_id === 'groupe-verbe');
ok(gv.status === 'a_retravailler' && gv.name === "Groupe d'un verbe", 'notion groupes ' + JSON.stringify(gv));
ok(st.weak_points.length === 2 && st.weak_points[1].label === '1er groupe' && st.weak_points[0].label === '3e groupe' && st.weak_points[0].total === 9 && st.weak_points[0].pct === 11, 'points faibles ' + JSON.stringify(st.weak_points));
ok(st.recent.length === 5 && st.recent[0].hard_mode && st.recent[0].rule_name === 'on / ont', 'dernières tentatives');
ok(s.studentStats([], rules, now).last_activity === null, 'élève sans activité');

console.log(fail ? `${fail} échec(s)` : 'tout OK');
if (fail) process.exit(1);
