import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as e from '../src/game/engine.js';
import { handTotal, pairKind, t21Kind, totalLabel } from '../shared/blackjack.js';

const mesa = (n, chips = []) => ({
  status: 'waiting',
  settings: { minBet: 10, maxBet: 0, startingChips: 1000, mode: 'blackjack' },
  handNo: 0,
  seats: Array.from({ length: n }, (_, i) => ({ userId: 'p' + i, chips: chips[i] ?? 1000, status: 'active' })),
});
// el sabot reparte desde el final: se le da la vuelta para escribir las cartas en orden de salida
const rig = (t, cards) => (t.hand.shoe = [...cards].reverse());

test('totales y apuestas laterales', () => {
  assert.deepEqual(handTotal(['Ah', '6d']), { total: 17, soft: true });
  assert.deepEqual(handTotal(['Ah', '6d', 'Ks']), { total: 17, soft: false });
  assert.equal(handTotal(['Ah', 'Ad', '9c']).total, 21);
  assert.equal(totalLabel(['Ah', 'Kd']), 'Blackjack');
  assert.equal(totalLabel(['Ah', 'Kd'], true), '21');
  assert.equal(totalLabel(['Ah', '5d']), '6 / 16');
  assert.equal(pairKind(['8h', '8h']), 'perfect');
  assert.equal(pairKind(['8h', '8d']), 'colored');
  assert.equal(pairKind(['8h', '8s']), 'mixed');
  assert.equal(pairKind(['8h', '9h']), null);
  assert.equal(t21Kind(['7h', '7h', '7h']), 'suitedTrips');
  assert.equal(t21Kind(['7h', '7d', '7c']), 'trips');
  assert.equal(t21Kind(['Qh', 'Kh', 'Ah']), 'straightFlush');
  assert.equal(t21Kind(['Ah', '2d', '3c']), 'straight');
  assert.equal(t21Kind(['2h', '9h', 'Kh']), 'flush');
  assert.equal(t21Kind(['Kh', 'Ad', '2c']), null);
});

test('ronda completa: pedir, plantarse y la banca se pasa', () => {
  const t = mesa(2);
  e.startHand(t);
  assert.equal(t.hand.stage, 'bets');
  // p0 9+7, p1 10+Q, banca 6 + 10 (16): pide y se pasa con un 8
  rig(t, ['9h', 'Ts', '6c', '7d', 'Qh', 'Td', '4s', '8c']);
  e.bjBet(t, 'p0', { main: 100 });
  assert.equal(t.hand.stage, 'bets'); // falta p1
  e.bjBet(t, 'p1', { main: 50 });
  assert.equal(t.hand.stage, 'play');
  assert.equal(t.hand.toAct, 'p0');
  e.bjAct(t, 'p0', 'hit'); // 9+7+4 = 20
  assert.equal(t.hand.toAct, 'p0');
  e.bjAct(t, 'p0', 'stand');
  e.bjAct(t, 'p1', 'stand');
  assert.equal(t.hand.stage, 'done');
  assert.deepEqual(t.hand.dealer, ['6c', 'Td', '8c']);
  assert.deepEqual(t.seats.map((s) => s.chips), [1100, 1050]);
});

test('blackjack paga 3 a 2 y el empate devuelve la apuesta', () => {
  const t = mesa(2);
  e.startHand(t);
  // p0 A+K, p1 10+8, banca 9+9 = 18
  rig(t, ['Ah', 'Ts', '9c', 'Kd', '8h', '9d']);
  e.bjBet(t, 'p0', { main: 100 });
  e.bjBet(t, 'p1', { main: 100 });
  assert.equal(t.hand.toAct, 'p1'); // la mano con blackjack ya está cerrada
  e.bjAct(t, 'p1', 'stand');
  assert.deepEqual(t.seats.map((s) => s.chips), [1150, 1000]);
  assert.equal(t.hand.players[0].hands[0].result, 'blackjack');
  assert.equal(t.hand.players[1].hands[0].result, 'push');
});

test('la banca con blackjack acaba la ronda al repartir', () => {
  const t = mesa(1);
  e.startHand(t);
  rig(t, ['9h', 'Ac', '9d', 'Kc']);
  e.bjBet(t, 'p0', { main: 100 });
  assert.equal(t.hand.stage, 'done');
  assert.equal(t.hand.result.dealerBJ, true);
  assert.equal(t.seats[0].chips, 900);
});

test('doblar y dividir', () => {
  const t = mesa(1);
  e.startHand(t);
  // p0 8+8, banca 6+10; al dividir: 8+3 (dobla y saca 10 = 21), 8+9 = 17; la banca saca 7 = 23
  rig(t, ['8h', '6c', '8d', 'Tc', '3s', '9s', 'Th', '7d']);
  e.bjBet(t, 'p0', { main: 100 });
  assert.equal(t.hand.players[0].hands.length, 1);
  assert.ok(e.bjOptions(t, 'p0').canSplit);
  e.bjAct(t, 'p0', 'split');
  assert.equal(t.hand.players[0].hands.length, 2);
  e.bjAct(t, 'p0', 'double');
  assert.equal(t.hand.players[0].cur, 1);
  e.bjAct(t, 'p0', 'stand');
  assert.equal(t.hand.stage, 'done');
  // apuesta 100 + dividir 100 + doblar 100 = 300 en juego; gana las dos: 200*2 + 100*2
  assert.equal(t.seats[0].chips, 1300);
});

test('apuestas laterales: Par y 21+3', () => {
  const t = mesa(1);
  e.startHand(t);
  // 7♥ 7♥ con la banca 7♥: pareja perfecta (25:1) y trío del mismo palo (100:1)
  rig(t, ['7h', '7h', '7h', 'Tc', 'Ks']);
  e.bjBet(t, 'p0', { main: 10, pair: 10, t21: 10 });
  const p = t.hand.players[0];
  assert.equal(p.side.pair.kind, 'perfect');
  assert.equal(p.side.pair.win, 260);
  assert.equal(p.side.t21.win, 1010);
  assert.throws(() => e.bjBet(t, 'p0', { main: 10 }), /Ya no se admiten/);
});

test('límites de apuesta', () => {
  const t = mesa(1, [100]);
  t.settings.maxBet = 50;
  e.startHand(t);
  assert.throws(() => e.bjBet(t, 'p0', { main: 5 }), /mínima/);
  assert.throws(() => e.bjBet(t, 'p0', { main: 60 }), /máxima/);
  assert.throws(() => e.bjBet(t, 'p0', { main: 20, pair: 30 }), /laterales/);
  assert.throws(() => e.bjBet(t, 'p1', { main: 20 }), /No juegas/);
});

test('se acaba el tiempo de apostar: quien no apostó se queda fuera', () => {
  const t = mesa(2);
  e.startHand(t);
  rig(t, ['Th', 'Tc', '9d', '7c']);
  e.bjBet(t, 'p0', { main: 100 });
  assert.deepEqual(e.bjCloseBets(t), ['p1']);
  assert.equal(t.hand.stage, 'play');
  assert.ok(t.hand.players[1].out);
  e.bjAct(t, 'p0', 'stand');
  assert.deepEqual(t.seats.map((s) => s.chips), [1100, 1000]);
});

test('si nadie apuesta no hay ronda; quien se va antes del reparto recupera su apuesta', () => {
  const t = mesa(2);
  e.startHand(t);
  e.bjBet(t, 'p0', { main: 100 });
  e.foldOut(t, 'p0');
  assert.equal(t.hand.stage, 'bets');
  e.bjCloseBets(t);
  assert.equal(t.hand.stage, 'done');
  assert.deepEqual(t.seats.map((s) => s.chips), [1000, 1000]);
});

test('turno agotado: se planta', () => {
  const t = mesa(1);
  e.startHand(t);
  rig(t, ['Th', '9c', '7d', '8c']);
  e.bjBet(t, 'p0', { main: 100 });
  e.forceFold(t, 'p0'); // 17 contra 17: empate
  assert.equal(t.hand.stage, 'done');
  assert.equal(t.seats[0].chips, 1000);
});
