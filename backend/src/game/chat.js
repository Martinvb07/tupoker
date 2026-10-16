// Chat de la mesa: en memoria (los últimos mensajes), con respuestas y reacciones.
// Un mensaje cada 5 s por jugador para que no se llene de spam.
import { randomUUID } from 'node:crypto';

export const CHAT_COOLDOWN_MS = 5000;
export const CHAT_MAX_LEN = 300;
export const CHAT_REACTIONS = ['👍', '😂', '🔥', '😮', '😢', '❤️'];
const MAX_MESSAGES = 150;

const rooms = new Map(); // code -> { messages: [], lastSend: Map(userId -> ts) }
const room = (code) => {
  if (!rooms.has(code)) rooms.set(code, { messages: [], lastSend: new Map() });
  return rooms.get(code);
};

export const history = (code) => room(code).messages;
export const dropChat = (code) => rooms.delete(code);

/** Crea un mensaje; lanza { wait } si el jugador aún está en cooldown. */
export function addMessage(code, seat, text, replyToId) {
  const r = room(code);
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);
  if (!clean) throw Object.assign(new Error('Escribe algo'), { chat: true });
  const now = Date.now();
  const last = r.lastSend.get(seat.userId) || 0;
  if (now - last < CHAT_COOLDOWN_MS) {
    const wait = CHAT_COOLDOWN_MS - (now - last);
    throw Object.assign(new Error(`Espera ${Math.ceil(wait / 1000)} s para volver a escribir`), { chat: true, wait });
  }
  r.lastSend.set(seat.userId, now);
  const parent = replyToId ? r.messages.find((m) => m.id === replyToId) : null;
  const msg = {
    id: randomUUID(),
    userId: seat.userId,
    name: seat.displayName,
    avatarUrl: seat.avatarUrl,
    avatarColor: seat.avatarColor,
    text: clean,
    replyTo: parent ? { id: parent.id, name: parent.name, text: parent.text.slice(0, 90) } : null,
    reactions: {}, // emoji -> [userIds]
    at: now,
  };
  r.messages.push(msg);
  if (r.messages.length > MAX_MESSAGES) r.messages.shift();
  return msg;
}

/** Pone o quita la reacción del usuario en un mensaje. Devuelve el mensaje actualizado. */
export function toggleReaction(code, id, emoji, userId) {
  if (!CHAT_REACTIONS.includes(emoji)) return null;
  const msg = room(code).messages.find((m) => m.id === id);
  if (!msg) return null;
  const list = msg.reactions[emoji] || [];
  msg.reactions[emoji] = list.includes(userId) ? list.filter((u) => u !== userId) : [...list, userId];
  if (!msg.reactions[emoji].length) delete msg.reactions[emoji];
  return msg;
}
