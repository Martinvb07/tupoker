# TuPoker — Royal Flush

Web para gestionar partidas de póker Texas Hold'em con amigos usando **cartas físicas**: la app lleva las fichas, los turnos, los botes y los rankings. El dealer pone en la app las cartas del flop, turn y river, y cada jugador registra sus dos cartas para ver qué jugada tiene y su probabilidad de ganar.

## Funcionalidades

- **Cuentas** con usuario y contraseña. Todos empiezan con el mismo rol.
- **Mesas** con código de 6 letras y **QR** para entrar. El **dealer** define la apuesta mínima (ciega grande) y la máxima, y de ahí salen las **fichas** de la mesa (5K, 25K, 50K…). El rol de dealer lo pasa el creador o el dealer actual, y puede jugar o solo repartir.
- **Panel de apuestas estilo casino**: abanico de fichas, círculo para apilar, deshacer, limpiar y doblar, y atajos (mínimo, ½ bote, bote, all-in). Acciones: retirarse, pasar, igualar, apostar/subir y all-in.
- **Motor completo**: ciegas, heads-up, subida mínima, apuesta máxima, all-in, **botes laterales**, showdown con ganador sugerido, empates y fichas sobrantes.
- **Probabilidades** en vivo (Monte Carlo en un Web Worker): jugada actual, % de ganar o empatar y probabilidad de ligar cada jugada.
- **Grupos**: guardan la configuración de la mesa, el dealer por defecto y los miembros. "Abrir mesa" con un toque, sin volver a configurarla.
- **Rankings** por grupo y general (jugadores y grupos): balance, ganado, perdido, apostado, % de victorias, manos jugadas y mayor bote.
- **Perfil**: foto con recorte, color de avatar, bio, color del tapete y baraja de 4 colores.
- Interfaz **responsive** (móvil primero) con animaciones suaves.

## Stack

| Parte | Tecnología |
|---|---|
| Backend | Node 22 · Express · Socket.IO · MongoDB (Mongoose) · JWT en cookie httpOnly |
| Frontend | Vue 3 · Vite · Vue Router (sin librería de UI) |
| Compartido | `backend/shared/poker.js` (evaluador y probabilidades, usado por backend y frontend) |
| Producción | pm2 (API) + nginx (estáticos y proxy) — sin Docker |

```
backend/    API REST + tiempo real (src/), motor compartido (shared/), tests (test/)
frontend/   SPA en Vue (src/views, src/components)
deploy/     nginx.conf de ejemplo
ecosystem.config.cjs   proceso pm2
.github/workflows/deploy.yml   CI + deploy al VPS
```

## Desarrollo local

Requisitos: Node 22+ y MongoDB corriendo en `127.0.0.1:27017`.

```bash
cd backend && cp .env.example .env && npm install && npm run dev
cd frontend && npm install && npm run dev      # http://localhost:5173
```

Vite redirige `/api`, `/socket.io` y `/uploads` al backend (puerto 4000 en local; en producción la API usa el 4010). Para probar desde el móvil en la misma red, abre `http://IP-DE-TU-PC:5173`.

Tests del motor: `cd backend && npm test`.

## Primera instalación en el VPS

```bash
# 1. Dependencias (Ubuntu)
sudo apt install -y nginx git
# Node 22 (nodesource) y MongoDB Community, según su documentación
sudo npm i -g pm2

# 2. Código
sudo mkdir -p /var/www/tupoker && sudo chown $USER /var/www/tupoker
git clone https://github.com/Martinvb07/tupoker.git /var/www/tupoker
cd /var/www/tupoker

# 3. Variables de entorno
cp backend/.env.example backend/.env
nano backend/.env    # JWT_SECRET largo y aleatorio, NODE_ENV=production, PUBLIC_URL=https://tu-dominio

# 4. Build y arranque
(cd backend && npm ci --omit=dev)
(cd frontend && npm ci && npm run build)
pm2 startOrReload ecosystem.config.cjs && pm2 save && pm2 startup

# 5. nginx + HTTPS
sudo cp deploy/nginx.conf /etc/nginx/sites-available/tupoker   # edita server_name y rutas
sudo ln -s /etc/nginx/sites-available/tupoker /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d tu-dominio
```

> nginx necesita permiso de lectura sobre `frontend/dist` y `backend/uploads`.
> La API **debe correr con una sola instancia de pm2** (el estado de las mesas vive en memoria y se guarda en Mongo tras cada jugada).

## Deploy automático (GitHub Actions)

Cada push a `main` ejecuta los tests y el build. Si pasan, entra por SSH al VPS, actualiza el código, construye, recarga pm2 y comprueba `GET /api/health`. Si el health check falla, **vuelve sola a la versión anterior**.

Secrets necesarios en el repo (Settings → Secrets → Actions), dentro del environment `produccion`:

| Secret | Valor |
|---|---|
| `VPS_HOST` | IP o dominio del VPS |
| `VPS_USER` | usuario SSH |
| `VPS_SSH_KEY` | clave privada SSH (su pública en `~/.ssh/authorized_keys` del VPS) |
| `VPS_PATH` | `/var/www/tupoker` |

## Cómo se juega

1. Crea una mesa (o ábrela desde tu grupo) y comparte el QR o el código.
2. El dealer pulsa **Repartir mano**: las ciegas se ponen solas y el botón rota.
3. Cada jugador toca sus dos cartas vacías y registra las que le tocaron. Desde ese momento ve su jugada y su probabilidad.
4. Cuando le toca, elige ficha en el abanico, la apila en el círculo y confirma, o usa retirarse, pasar o igualar.
5. Al cerrar cada ronda, al dealer se le abre el selector para poner el **flop**, el **turn** y el **river**.
6. En el showdown, la app sugiere el ganador de cada bote (si los jugadores registraron sus cartas) y el dealer confirma.
