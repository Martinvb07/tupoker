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
  // con máxima ninguna ficha la supera y la máxima es una ficha
  assert.deepEqual(chipDenominations(1000, 2000, 20000), [1000, 2000]);
  assert.deepEqual(chipDenominations(100, 1000), [100, 500, 1000]);
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
  assert.throws(() => e.setHoleCards(t, 'p0', ['As', 'Ks']), /la app reparte/);
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

test('la viuda: reparto, ver, llevarse el centro, cambios, tocar y ganador', () => {
  const t = mesa(3, [0, 0, 0]);
  t.settings.mode = 'viuda';
  e.startHand(t);
  const h = t.hand;
  assert.equal(h.stage, 'viuda');
  assert.equal(h.widow.length, 5);
  assert.ok(h.players.every((p) => p.cards.length === 5 && !p.seen));
  assert.equal(new Set([...h.widow, ...h.players.flatMap((p) => p.cards)]).size, 20);
  assert.throws(() => e.act(t, 'p0', 'check'), /no hay apuestas/);
  // p1 se lleva el centro sin ver; su mano queda en el centro, tapada hasta que todos vean
  const vieja = [...e.getPlayer(h, 'p1').cards];
  e.viudaTakeWidow(t, 'p1');
  assert.deepEqual(h.widow, vieja);
  assert.equal(h.widowOpen, false);
  // quien ya vio sus cartas no puede llevarse el centro
  e.viudaSee(t, 'p0');
  assert.throws(() => e.viudaTakeWidow(t, 'p0'), /Ya viste/);
  assert.equal(h.stage, 'viuda');
  assert.equal(h.widowOpen, false);
  e.viudaSee(t, 'p2'); // todos vieron: se destapa el centro y empiezan los cambios
  assert.equal(h.stage, 'cambios');
  assert.ok(h.widowOpen);
  const first = h.toAct;
  assert.throws(() => e.viudaAct(t, first === 'p0' ? 'p2' : 'p0', { type: 'pass' }), /No es tu turno/);
  // quien se llevó la viuda no puede tocar en su primer turno
  while (h.toAct !== 'p1') e.viudaAct(t, h.toAct, { type: 'pass' });
  assert.throws(() => e.viudaAct(t, 'p1', { type: 'knock' }), /siguiente turno/);
  // cambiar 1 por 1 del centro
  const me = e.getPlayer(h, 'p1');
  const give = me.cards[0], take = h.widow[0];
  e.viudaAct(t, 'p1', { type: 'swap', give, take });
  assert.ok(me.cards.includes(take) && h.widow.includes(give));
  // toca el siguiente: los otros dos juegan una última vez y se acaba
  const knocker = h.toAct;
  e.viudaAct(t, knocker, { type: 'knock' });
  assert.equal(h.lastTurns.length, 2);
  assert.throws(() => e.viudaAct(t, h.toAct, { type: 'knock' }), /última vuelta/);
  e.viudaAct(t, h.toAct, { type: 'pass' });
  e.viudaAct(t, h.toAct, { type: 'pass' });
  assert.equal(h.stage, 'done');
  assert.ok(h.result.winners.length >= 1);
  assert.equal(Object.keys(h.handNames).length, 3);
  assert.equal(h.needsPersist, undefined); // la viuda no cuenta para los rankings
});

test('la viuda: si se acaba el tiempo se destapan todas; máximo 9 jugadores', () => {
  const t = mesa(2, [0, 0]);
  t.settings.mode = 'offline'; // las mesas antiguas «sin dinero» juegan a la viuda
  e.startHand(t);
  assert.equal(t.hand.mode, 'viuda');
  e.viudaRevealAll(t);
  assert.equal(t.hand.stage, 'cambios');
  // si uno se va, gana el otro
  e.foldOut(t, t.hand.toAct);
  assert.equal(t.hand.stage, 'done');
  assert.equal(t.hand.result.winners.length, 1);
  const big = mesa(10, Array(10).fill(0));
  big.settings.mode = 'viuda';
  assert.throws(() => e.startHand(big), /como máximo 9/);
});

test('la viuda: si pasan todos salen 5 cartas nuevas del mismo mazo', () => {
  for (const n of [3, 9]) {
    const t = mesa(n, Array(n).fill(0));
    t.settings.mode = 'viuda';
    e.startHand(t);
    const h = t.hand;
    e.viudaRevealAll(t);
    for (let vuelta = 0; vuelta < 4; vuelta++) {
      const antes = [...h.widow];
      for (let i = 0; i < n; i++) e.viudaAct(t, h.toAct, { type: 'pass' });
      assert.equal(h.widow.length, 5);
      assert.ok(h.widow.every((c) => !antes.includes(c)) || n === 9); // con 9 el descarte vuelve al mazo
      // nunca se repite una carta que tenga alguien
      const enJuego = [...h.widow, ...h.players.flatMap((p) => p.cards)];
      assert.equal(new Set(enJuego).size, 5 * (n + 1));
    }
    assert.equal(h.widowDeals, 4);
    // si alguien cambia, la cuenta de pases vuelve a empezar
    const antes = [...h.widow];
    e.viudaAct(t, h.toAct, { type: 'pass' });
    const me = e.getPlayer(h, h.toAct);
    e.viudaAct(t, h.toAct, { type: 'swap', give: me.cards[0], take: h.widow[0] });
    for (let i = 0; i < n - 1; i++) e.viudaAct(t, h.toAct, { type: 'pass' });
    assert.equal(h.widowDeals, 4);
    assert.equal(h.widow.filter((c) => antes.includes(c)).length, 4);
  }
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
  t.settings.mode = 'viuda';
  assert.throws(() => e.checkRebuy(t, 'p0'), /no hay fichas/);
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

test('bote lateral: quien va all-in con 7K en el flop solo gana lo que pudo cubrir', () => {
  // p0 tiene 8K; p1 y p2, 20K. Ciegas 500/1000
  const t = {
    status: 'waiting', settings: { mode: 'live', minBet: 1000, maxBet: 0, startingChips: 20000 }, handNo: 0, buttonUserId: null,
    seats: [{ userId: 'p0', chips: 8000, status: 'active' }, { userId: 'p1', chips: 20000, status: 'active' }, { userId: 'p2', chips: 20000, status: 'active' }],
  };
  e.startHand(t);
  const calle = (fn) => { for (let i = 0; i < 20 && !t.hand.awaiting && t.hand.stage !== 'showdown'; i++) fn(t.hand.toAct); };
  calle((id) => e.act(t, id, e.legalActions(t, id).canCheck ? 'check' : 'call')); // preflop: todos 1K
  e.setBoard(t, ['As', 'Kd', '7c']);
  // flop: p0 se mete all-in con sus 7K y los demás pagan
  calle((id) => e.act(t, id, id === 'p0' ? 'allin' : e.legalActions(t, id).canCheck ? 'check' : 'call'));
  e.setBoard(t, ['2h']);
  // turn: p1 y p2 siguen apostando entre ellos (5K)
  calle((id) => (t.hand.currentBet === 0 ? e.act(t, id, 'raise', 5000) : e.act(t, id, 'call')));
  e.setBoard(t, ['9s']);
  calle((id) => e.act(t, id, 'check'));
  assert.equal(t.hand.stage, 'showdown');
  assert.deepEqual(t.hand.pots.map((p) => p.amount), [24000, 10000]);
  assert.deepEqual(t.hand.pots[1].eligible.sort(), ['p1', 'p2']);
  // gana p0: se lleva el bote principal (24K); el lateral (10K) es de p1
  e.resolveShowdown(t, [['p0'], ['p1']]);
  assert.deepEqual(t.hand.result.payout, { p0: 24000, p1: 10000 });
  assert.equal(t.seats.find((s) => s.userId === 'p0').chips, 24000);
  assert.equal(total(t), 48000);
});

test('en vivo: si alguien no registró sus cartas la app no sugiere ganador', () => {
  const t = mesa(3);
  t.settings.mode = 'live';
  e.startHand(t);
  e.setHoleCards(t, 'p0', ['Ah', 'Ad']);
  e.setHoleCards(t, 'p1', ['2c', '3d']);
  const calle = () => { for (let i = 0; i < 10 && !t.hand.awaiting && t.hand.stage !== 'showdown'; i++) e.act(t, t.hand.toAct, e.legalActions(t, t.hand.toAct).canCheck ? 'check' : 'call'); };
  calle(); e.setBoard(t, ['As', 'Kd', '7c']);
  calle(); e.setBoard(t, ['2h']);
  calle(); e.setBoard(t, ['9s']);
  calle();
  assert.equal(t.hand.stage, 'showdown');
  assert.deepEqual(t.hand.pots[0].suggested, []);
  assert.equal(t.hand.pots[0].complete, false);
  // el dealer decide y reparte
  e.resolveShowdown(t, [['p2']]);
  assert.equal(t.hand.result.payout.p2, 60);
});

test('en vivo: las cartas registradas solo se cambian con permiso del dealer', () => {
  const t = mesa(3);
  t.settings.mode = 'live';
  e.startHand(t);
  e.setHoleCards(t, 'p0', ['Ah', 'Ad']);
  assert.throws(() => e.setHoleCards(t, 'p0', ['Kh', 'Kd']), /permiso al dealer/);
  e.getPlayer(t.hand, 'p0').cardsUnlock = true; // el dealer acepta
  e.setHoleCards(t, 'p0', ['Kh', 'Kd']);
  assert.deepEqual(e.getPlayer(t.hand, 'p0').cards, ['Kh', 'Kd']);
  // el permiso vale para un solo cambio
  assert.throws(() => e.setHoleCards(t, 'p0', ['Qh', 'Qd']), /permiso al dealer/);
  // el dealer puede corregir las suyas
  e.setHoleCards(t, 'p1', ['2c', '3c']);
  e.setHoleCards(t, 'p1', ['4c', '5c'], { free: true });
});

test('en vivo el dealer no juega aunque tenga asiento y fichas', () => {
  const t = mesa(3);
  t.settings.mode = 'live';
  t.dealerId = 'p0';
  e.startHand(t);
  assert.deepEqual(t.hand.players.map((p) => p.userId).sort(), ['p1', 'p2']);
  assert.equal(e.eligibleSeats(t).length, 2);
  // con un solo jugador además del dealer no hay mano
  const u = mesa(2);
  u.settings.mode = 'live';
  u.dealerId = 'p0';
  assert.throws(() => e.startHand(u), /al menos 2/);
});
