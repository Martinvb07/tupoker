import { io } from 'socket.io-client';
import { ref } from 'vue';

let socket = null;
export const connected = ref(false);

export function getSocket() {
  if (!socket) {
    socket = io({ path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'] });
    socket.on('connect', () => (connected.value = true));
    socket.on('disconnect', () => (connected.value = false));
  }
  return socket;
}

export function resetSocket() {
  socket?.disconnect();
  socket = null;
  connected.value = false;
}

/** emit con promesa: resuelve si ok, lanza Error con el mensaje del servidor si no. */
export function emit(event, payload) {
  return new Promise((resolve, reject) => {
    getSocket()
      .timeout(8000)
      .emit(event, payload, (err, res) => {
        if (err) return reject(new Error('El servidor no respondió'));
        if (!res?.ok) return reject(new Error(res?.error || 'Error'));
        resolve(res);
      });
  });
}
