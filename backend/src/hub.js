// Referencia compartida a socket.io para emitir el estado de una mesa desde cualquier sitio.
import { viewFor } from './game/manager.js';

let io = null;
export const setIO = (instance) => { io = instance; };

export const roomOf = (code) => `table:${code}`;

export async function broadcast(table) {
  if (!io) return;
  const sockets = await io.in(roomOf(table.code)).fetchSockets();
  for (const s of sockets) s.emit('table:state', viewFor(table, s.data.userId));
}

export function notifyUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}
