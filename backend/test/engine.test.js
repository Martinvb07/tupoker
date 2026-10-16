import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../src/game/engine.js';
import { evaluate, chipDenominations, equity } from '../shared/poker.js';

const mesa = (n, chips = []) => ({
  status: 'waiting',
  settings: { minBet: 20, maxBet: 0, startingChips: 1000 },
  handNo: 0,
  buttonUserId: null,
  seats: Array.from({ length: n }, (_, i) => ({ userId: 'p' + i, chips: chips[i] ?? 1000, status: 'active' })),
});
const total = (t) => t.seats.reduce((s, x) => s + x.chips, 0);

test('evaluador reconoce las jugadas', () => {
  assert.equal(evaluate(['As', 'Ks', 'Qs', 'Js', 'Ts', '2d', '3c']).name, 'Escalera real');
  assert.equal(evaluate(['Ah', '2d', '3c', '4s', '5h', 'Kd', 'Kc']).categoryName, 'Escalera');
  assert.equal(evaluate(['Ah', 'Ad', 'Ac', 'Ks', 'Kh', 'Kd', '2c']).name, 'Full de Ases con Reyes');
  assert.ok(evaluate(['As', 'Ad', 'Kc', 'Qs', '2h']).score > evaluate(['As', 'Ad', 'Kc', 'Js', '2h']).score);
});

test('equity de AA contra una mano aleatoria ronda el 85%', () => {
  const r = equity({ hole: ['As', 'Ah'], opponents: 1, iterations: 20000 });
  assert.ok(r.equity > 82 && r.equity < 88, `equity ${r.equity}`);
});

test('fichas salen de la mínima y la máxima', () => {
  assert.deepEqual(chipDenominations(100, 0, 5000), [100, 500, 1000, 2500, 5000]);
  assert.ok(chipDenominations(5000, 100000).every((v) => v >= 5000));
});

test('mano completa a 3 con showdown', () => {
  const t = mesa(3);
  e.startHand(t);
  assert.equal(t.hand.toAct, 'p0');
  e.act(t, 'p0', 'call');
  e.act(t, 'p1', 'call');
  e.act(t, 'p2', 'check');
  assert.equal(t.hand.awaiting, 'flop');
  e.setBoard(t, ['As', 'Kd', '7c']);
  e.setHoleCards(t, 'p0', ['Ah', 'Ad']);
  e.setHoleCards(t, 'p1', ['Kh', 'Kc']);
  assert.throws(() => e.setHoleCards(t, 'p2', ['Ah', '2c']));
  e.act(t, 'p1', 'raise', 50);
  e.act(t, 'p2', 'fold');
  e.act(t, 'p0', 'raise', 150);
  e.act(t, 'p1', 'call');
  e.setBoard(t, ['2h']);
  e.act(t, 'p1', 'check');
  e.act(t, 'p0', 'check');
  e.setBoard(t, ['3h']);
  e.act(t, 'p1', 'check');
  e.act(t, 'p0', 'check');
  assert.equal(t.hand.stage, 'showdown');
  assert.deepEqual(t.hand.pots[0].suggested, ['p0']);
  e.resolveShowdown(t, [['p0']]);
  assert.deepEqual(t.seats.map((s) => s.chips), [1190, 830, 980]);
});

test('botes laterales con all-in', () => {
  const t = mesa(3, [100, 500, 1000]);
  e.startHand(t);
  e.act(t, t.hand.toAct, 'allin');
  e.act(t, t.hand.toAct, 'allin');
  e.act(t, t.hand.toAct, 'call');
  e.setBoard(t, ['As', 'Kd', '7c']);
  e.setBoard(t, ['2c']);
  e.setBoard(t, ['9d']);
  assert.deepEqual(t.hand.pots.map((p) => p.amount), [300, 800]);
  e.resolveShowdown(t, [['p0'], ['p2']]);
  assert.deepEqual(t.seats.map((s) => s.chips), [300, 0, 1300]);
  assert.equal(total(t), 1600);
});

test('heads-up: el botón pone la ciega pequeña y la subida mínima se respeta', () => {
  const t = mesa(2);
  e.startHand(t);
  assert.equal(t.hand.sbId, t.hand.buttonId);
  e.act(t, t.hand.toAct, 'fold');
  e.startHand(t);
  assert.throws(() => e.act(t, t.hand.toAct, 'raise', 30), /mínima/);
  assert.equal(total(t), 2000);
});

test('la apuesta máxima limita las subidas', () => {
  const t = mesa(2);
  t.settings.maxBet = 100;
  e.startHand(t);
  assert.throws(() => e.act(t, t.hand.toAct, 'raise', 500), /máxima/);
  e.act(t, t.hand.toAct, 'raise', 120);
  assert.equal(t.hand.currentBet, 120);
});

test('modo aleatorio: la app reparte cartas y board y resuelve sola', () => {
  const t = mesa(3);
  t.settings.mode = 'random';
  e.startHand(t);
  const all = t.hand.players.flatMap((p) => p.cards);
  assert.equal(new Set(all).size, 6);
  assert.throws(() => e.setHoleCards(t, 'p0', ['As', 'Ks']), /aleatorio/);
  e.act(t, t.hand.toAct, 'call');
  e.act(t, t.hand.toAct, 'call');
  e.act(t, t.hand.toAct, 'check');
  assert.equal(t.hand.board.length, 3);
  assert.equal(t.hand.awaiting, null);
  assert.throws(() => e.setBoard(t, ['2c']));
  for (let i = 0; i < 9 && t.hand.stage !== 'done'; i++) e.act(t, t.hand.toAct, 'check');
  assert.equal(t.hand.stage, 'done');
  assert.equal(t.hand.board.length, 5);
  assert.equal(total(t), 3000);
  assert.equal(t.hand.deck, undefined);
});

test('modo aleatorio: all-in preflop reparte todo el board', () => {
  const t = mesa(2);
  t.settings.mode = 'random';
  e.startHand(t);
  e.act(t, t.hand.toAct, 'allin');
  e.act(t, t.hand.toAct, 'call');
  assert.equal(t.hand.stage, 'done');
  assert.equal(t.hand.board.length, 5);
  assert.equal(total(t), 2000);
});

test('modo sin dinero: sin apuestas, el dealer pone cartas y elige ganador', () => {
  const t = mesa(3, [0, 0, 0]);
  t.settings.mode = 'offline';
  e.startHand(t);
  assert.equal(t.hand.awaiting, 'flop');
  assert.throws(() => e.act(t, 'p0', 'check'), /sin dinero/);
  e.setHoleCards(t, 'p0', ['Ah', 'Ad']);
  e.setHoleCards(t, 'p1', ['Kh', 'Kd']);
  e.setBoard(t, ['As', '7d', '2c']);
  assert.equal(t.hand.awaiting, 'turn');
  e.foldOut(t, 'p2');
  e.setBoard(t, ['9h']);
  e.setBoard(t, ['3s']);
  assert.equal(t.hand.stage, 'showdown');
  assert.deepEqual(t.hand.pots[0].suggested, ['p0']);
  e.resolveShowdown(t, [['p0']]);
  assert.deepEqual(t.hand.result.winners, ['p0']);
  assert.equal(t.hand.needsPersist, undefined);
});

test('nueva partida devuelve las fichas iniciales', () => {
  const t = mesa(2, [2000, 0]);
  assert.throws(() => e.startHand(t));
  e.resetChips(t);
  assert.deepEqual(t.seats.map((s) => s.chips), [1000, 1000]);
});

test('recompra: solo fuera de una mano viva y suma las fichas iniciales', () => {
  const t = mesa(2, [1000, 0]);
  e.applyRebuy(t, 'p1');
  assert.equal(t.seats[1].chips, 1000);
  assert.equal(t.seats[1].rebuys, 1);
  e.startHand(t);
  assert.throws(() => e.applyRebuy(t, 'p0'), /termine la mano/);
  e.act(t, t.hand.toAct, 'fold');
  e.applyRebuy(t, 'p0');
  t.settings.mode = 'offline';
  assert.throws(() => e.checkRebuy(t, 'p0'), /sin dinero/);
});

test('recompra votada: se aplica solo cuando aceptan todos los demás', () => {
  const t = mesa(3, [0, 1000, 1000]);
  t.settings.mode = 'random';
  t.seats[0].rebuyRequest = { amount: 1000, needed: ['p1', 'p2'], approvals: ['p1'] };
  assert.deepEqual(e.settleRebuyVotes(t), []);
  assert.equal(t.seats[0].chips, 0);
  t.seats[0].rebuyRequest.approvals.push('p2');
  assert.deepEqual(e.settleRebuyVotes(t), ['p0']);
  assert.equal(t.seats[0].chips, 1000);
  assert.equal(t.seats[0].rebuyRequest, undefined);
  // si un votante se va de la mesa, ya no hace falta su voto
  t.seats[1].rebuyRequest = { amount: 500, needed: ['p0', 'p2'], approvals: ['p0'] };
  t.seats = t.seats.filter((s) => s.userId !== 'p2');
  assert.deepEqual(e.settleRebuyVotes(t), ['p1']);
  assert.equal(t.seats[1].chips, 1500);
});

test('en vivo: la recompra pausa la partida y no se aplica sola aunque voten todos', () => {
  const t = mesa(3, [0, 1000, 1000]);
  t.settings.mode = 'live';
  t.seats[0].rebuyRequest = { amount: 1000, needed: ['p1'], approvals: ['p1'], dealerAssign: true };
  assert.equal(e.pausedBy(t).userId, 'p0');
  assert.deepEqual(e.settleRebuyVotes(t), []);
  assert.equal(t.seats[0].chips, 0);
  e.applyRebuy(t, 'p0', 1500); // lo hace el dealer
  assert.equal(t.seats[0].chips, 1500);
  assert.equal(e.pausedBy(t), null);
});

test('al terminar la mano un jugador puede enseñar sus cartas', () => {
  const t = mesa(2);
  t.settings.mode = 'random';
  e.startHand(t);
  assert.throws(() => e.showCards(t, 'p0'), /termina la mano/);
  e.act(t, t.hand.toAct, 'fold');
  const winner = t.hand.players.find((p) => !p.folded).userId;
  e.showCards(t, winner);
  assert.deepEqual(t.hand.shown, [winner]);
});
