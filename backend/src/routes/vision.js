// Escaneo de cartas: el dealer hace una foto del flop / turn / river y Claude (visión) lee las cartas.
// Necesita ANTHROPIC_API_KEY en backend/.env; sin ella la función se desactiva sola.
import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { ah, HttpError, requireAuth } from '../auth.js';
import { isValidCard } from '../../shared/poker.js';

const r = Router();
r.use(requireAuth);

const enabled = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
let client = null;
const getClient = () => (client ??= new Anthropic());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new HttpError(400, 'Formato de imagen no soportado'), ok);
  },
});
// cada foto cuesta una llamada a la API: límite por usuario
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 40,
  keyGenerator: (req) => req.userId,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados escaneos seguidos, espera unos minutos' },
});

const CardsSchema = z.object({
  cards: z.array(
    z.object({
      code: z.string().describe('Rango + palo, p. ej. "As", "Td", "9h". Rangos 23456789TJQKA, palos s h d c'),
      confident: z.boolean(),
    }),
  ),
});

const SYSTEM = `You read playing cards from photos of a home poker table.
Report every face-up card you can see, ordered left to right, using exactly two characters:
rank from 2 3 4 5 6 7 8 9 T J Q K A (T means ten) followed by suit: s = spades, h = hearts, d = diamonds, c = clubs.
Ignore face-down cards, chips, hands and anything that is not a playing card. Never invent cards that are not visible.
If a card is partly hidden or blurry, give your best reading and set confident to false.`;

r.get('/status', (req, res) => res.json({ enabled: enabled() }));

r.post('/cards', limiter, upload.single('photo'), ah(async (req, res) => {
  if (!enabled()) throw new HttpError(503, 'El escaneo de cartas no está configurado en el servidor');
  if (!req.file) throw new HttpError(400, 'No se recibió ninguna foto');
  const expected = Math.max(1, Math.min(5, Number(req.body.expected) || 3));
  const exclude = String(req.body.exclude || '').split(',').filter(isValidCard);

  const response = await readCards(req.file, expected, exclude);

  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    throw new HttpError(422, 'No se pudieron leer las cartas, prueba otra foto o márcalas a mano');
  }
  // validar y quitar repetidas o las que ya estaban en la mesa
  const seen = new Set(exclude);
  const cards = [];
  for (const c of response.parsed_output.cards) {
    const code = c.code.trim().replace(/^10/, 'T');
    const norm = code.length === 2 ? code[0].toUpperCase() + code[1].toLowerCase() : code;
    if (!isValidCard(norm) || seen.has(norm)) continue;
    seen.add(norm);
    cards.push({ code: norm, confident: c.confident });
  }
  res.json({ cards });
}));

async function readCards(file, expected, exclude) {
  try {
    return await callClaude(file, expected, exclude);
  } catch (e) {
    // errores de la API → mensajes que entiende el dealer (más específico primero)
    if (e instanceof Anthropic.AuthenticationError) {
      console.error('[vision] ANTHROPIC_API_KEY no válida');
      throw new HttpError(503, 'El escaneo de cartas no está bien configurado en el servidor');
    }
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, 'Demasiados escaneos a la vez, prueba en unos segundos');
    if (e instanceof Anthropic.APIError) {
      console.error('[vision]', e.status, e.message);
      throw new HttpError(502, 'El lector de cartas no responde ahora, márcalas a mano');
    }
    throw e;
  }
}

function callClaude(file, expected, exclude) {
  return getClient().messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    output_config: { effort: 'low', format: zodOutputFormat(CardsSchema) },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: file.mimetype, data: file.buffer.toString('base64') } },
          {
            type: 'text',
            text: `The dealer expects ${expected} new card(s) in this photo.${exclude.length ? ` Cards already on the table (may also appear in the photo): ${exclude.join(', ')}.` : ''}`,
          },
        ],
      },
    ],
  });
}

export default r;
