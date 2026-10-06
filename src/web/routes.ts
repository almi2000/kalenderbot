import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { CalendarService, NewEvent } from '../caldav/types.js';
import { parseMessage } from '../parser/index.js';
import { confirmPage, errorPage, homePage } from './views.js';

export interface WebDeps {
  calendar: CalendarService;
  defaultDurationMinutes: number;
  now?: () => Date;
}

const MAX_TEXT_LENGTH = 5000;
const UPCOMING_DAYS = 14;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const UID_RE = /^[A-Za-z0-9-]{8,64}$/;

interface ShareQuery {
  title?: string;
  text?: string;
  url?: string;
}

interface EventForm {
  uid?: string;
  title?: string;
  description?: string;
  date?: string;
  time?: string;
  endTime?: string;
  allDay?: string;
  important?: string;
}

function addMinutes(time: string, minutes: number): string {
  const [hour, minute] = time.split(':').map(Number);
  const total = ((hour ?? 0) * 60 + (minute ?? 0) + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Android liefert beim Teilen je nach App Titel, Text und/oder URL – alles Relevante zusammenführen. */
function sharedText(query: ShareQuery): string {
  const parts = [query.title, query.text, query.url]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0);
  const unique = parts.filter((part, index) => !parts.some((other, i) => i !== index && other.includes(part) && other !== part));
  return [...new Set(unique)].join(' ').slice(0, MAX_TEXT_LENGTH);
}

export function toNewEvent(form: EventForm, defaultDurationMinutes: number): NewEvent | string {
  const title = form.title?.trim() ?? '';
  const date = form.date?.trim() ?? '';
  const uid = form.uid?.trim() || randomUUID();
  if (!title) return 'Bitte einen Titel angeben.';
  if (!DATE_RE.test(date)) return 'Bitte ein gültiges Datum angeben.';
  if (!UID_RE.test(uid)) return 'Ungültige Termin-ID.';

  const rawTime = form.time?.trim() ?? '';
  const allDay = form.allDay === 'on' || rawTime === '';
  if (!allDay && !TIME_RE.test(rawTime)) return 'Bitte eine gültige Uhrzeit angeben.';
  const rawEnd = form.endTime?.trim() ?? '';
  if (!allDay && rawEnd && !TIME_RE.test(rawEnd)) return 'Bitte eine gültige Endzeit angeben.';

  return {
    uid,
    title: title.slice(0, 200),
    description: (form.description ?? '').slice(0, MAX_TEXT_LENGTH),
    date,
    time: allDay ? null : rawTime,
    endTime: allDay ? null : rawEnd || addMinutes(rawTime, defaultDurationMinutes),
    important: form.important === 'on',
  };
}

export function registerRoutes(app: FastifyInstance, deps: WebDeps): void {
  const now = deps.now ?? (() => new Date());
  const html = 'text/html; charset=utf-8';

  app.get('/healthz', async () => ({ ok: true }));

  app.get<{ Querystring: { saved?: string } }>('/', async (request, reply) => {
    const current = now();
    const from = new Date(current.getFullYear(), current.getMonth(), current.getDate());
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + UPCOMING_DAYS);
    try {
      const events = await deps.calendar.listEvents(from, to);
      return reply.type(html).send(homePage({ events, saved: request.query.saved }));
    } catch (error) {
      request.log.error({ err: error }, 'Termine konnten nicht geladen werden');
      return reply.type(html).send(homePage({ events: null, calendarError: (error as Error).message, saved: request.query.saved }));
    }
  });

  app.get<{ Querystring: ShareQuery }>('/share', async (request, reply) => {
    const text = sharedText(request.query);
    if (!text) return reply.redirect('/');
    const parsed = parseMessage(text, now());
    request.log.info({ prefilter: parsed.prefilter, primary: parsed.primary }, 'Nachricht analysiert');
    return reply.type(html).send(confirmPage(parsed, randomUUID()));
  });

  app.post<{ Body: EventForm }>('/events', async (request, reply) => {
    const event = toNewEvent(request.body ?? {}, deps.defaultDurationMinutes);
    if (typeof event === 'string') return reply.code(400).type(html).send(errorPage(event));
    try {
      await deps.calendar.createEvent(event);
    } catch (error) {
      request.log.error({ err: error }, 'Termin konnte nicht gespeichert werden');
      return reply.code(502).type(html).send(errorPage(`Kalender nicht erreichbar: ${(error as Error).message}`));
    }
    request.log.info({ uid: event.uid, date: event.date, time: event.time, important: event.important }, 'Termin gespeichert');
    return reply.redirect(`/?saved=${encodeURIComponent(event.title)}`, 303);
  });
}
