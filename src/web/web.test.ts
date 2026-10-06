import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { CalendarEvent, CalendarService, NewEvent } from '../caldav/types.js';

class FakeCalendar implements CalendarService {
  created: NewEvent[] = [];
  events: CalendarEvent[] = [];
  fail = false;

  async createEvent(event: NewEvent): Promise<void> {
    if (this.fail) throw new Error('Verbindung abgelehnt');
    this.created.push(event);
  }

  async listEvents(): Promise<CalendarEvent[]> {
    if (this.fail) throw new Error('Verbindung abgelehnt');
    return this.events;
  }
}

const NOW = new Date(2026, 9, 6, 21, 30);
let app: FastifyInstance | undefined;

async function setup(appToken = '') {
  const calendar = new FakeCalendar();
  app = await buildApp({
    calendar,
    defaultDurationMinutes: 60,
    appToken,
    secureCookie: false,
    logger: false,
    now: () => NOW,
  });
  return { app, calendar };
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('Share Target', () => {
  it('füllt das Bestätigungsformular aus der geteilten Nachricht', async () => {
    const { app } = await setup();
    const text = 'Hey, wollen wir uns am Freitag um 19 Uhr im Kino treffen?';
    const response = await app.inject({ method: 'GET', url: `/share?text=${encodeURIComponent(text)}` });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('name="title" value="Kino treffen"');
    expect(response.body).toContain('name="date" value="2026-10-09"');
    expect(response.body).toContain('name="time" value="19:00"');
    expect(response.body).toContain('Erkannt: Wochentag, Uhrzeit');
  });

  it('warnt, wenn kein Datum erkannt wurde', async () => {
    const { app } = await setup();
    const response = await app.inject({ method: 'GET', url: '/share?text=Hallo%20zusammen' });
    expect(response.body).toContain('Kein Datum erkannt');
  });

  it('escaped HTML in Nachrichten', async () => {
    const { app } = await setup();
    const response = await app.inject({
      method: 'GET',
      url: `/share?text=${encodeURIComponent('<script>alert(1)</script> morgen um 9')}`,
    });
    expect(response.body).not.toContain('<script>alert(1)</script>');
    expect(response.body).toContain('&lt;script&gt;');
  });

  it('leitet ohne Text zur Startseite um', async () => {
    const { app } = await setup();
    const response = await app.inject({ method: 'GET', url: '/share' });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/');
  });
});

describe('POST /events', () => {
  it('legt einen Termin mit Standarddauer an', async () => {
    const { app, calendar } = await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/events',
      payload: 'uid=0f8fad5b-d9cb-469f-a165-70867728950e&title=Kino&date=2026-10-09&time=19:00&endTime=&important=on&description=Nachricht',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/?saved=Kino');
    expect(calendar.created).toEqual([
      {
        uid: '0f8fad5b-d9cb-469f-a165-70867728950e',
        title: 'Kino',
        description: 'Nachricht',
        date: '2026-10-09',
        time: '19:00',
        endTime: '20:00',
        important: true,
      },
    ]);
  });

  it('speichert ganztägig, wenn keine Uhrzeit angegeben ist', async () => {
    const { app, calendar } = await setup();
    await app.inject({
      method: 'POST',
      url: '/events',
      payload: 'title=Geburtstag&date=2026-11-03',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(calendar.created[0]).toMatchObject({ time: null, endTime: null, important: false });
  });

  it('lehnt ungültige Eingaben ab', async () => {
    const { app, calendar } = await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/events',
      payload: 'title=Kino&date=morgen&time=19:00',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(response.statusCode).toBe(400);
    expect(calendar.created).toHaveLength(0);
  });

  it('meldet einen nicht erreichbaren Kalender', async () => {
    const { app, calendar } = await setup();
    calendar.fail = true;
    const response = await app.inject({
      method: 'POST',
      url: '/events',
      payload: 'title=Kino&date=2026-10-09&time=19:00',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(response.statusCode).toBe(502);
    expect(response.body).toContain('Kalender nicht erreichbar');
  });
});

describe('Startseite', () => {
  it('zeigt anstehende Termine', async () => {
    const { app, calendar } = await setup();
    calendar.events = [
      {
        uid: 'a',
        title: 'Zahnarzt',
        description: '',
        start: new Date(2026, 9, 12, 9, 0),
        end: new Date(2026, 9, 12, 10, 0),
        allDay: false,
        important: true,
      },
    ];
    const response = await app.inject({ method: 'GET', url: '/?saved=Zahnarzt' });
    expect(response.body).toContain('Gespeichert: <strong>Zahnarzt</strong>');
    expect(response.body).toContain('⭐ Zahnarzt');
    expect(response.body).toContain('Mo., 12.10.2026, 09:00 Uhr – 10:00');
  });
});

describe('Anmeldung per Token', () => {
  it('schützt Seiten, lässt Manifest und Icons aber offen', async () => {
    const { app } = await setup('geheim');
    expect((await app.inject({ method: 'GET', url: '/' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/share?text=x' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/manifest.webmanifest' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/icons/icon-192.png' })).statusCode).toBe(200);
  });

  it('setzt nach gültigem Token ein Cookie', async () => {
    const { app } = await setup('geheim');
    expect((await app.inject({ method: 'GET', url: '/login?token=falsch' })).statusCode).toBe(401);

    const login = await app.inject({ method: 'GET', url: '/login?token=geheim' });
    expect(login.statusCode).toBe(302);
    const cookie = login.cookies.find((c) => c.name === 'kalender_auth');
    expect(cookie?.httpOnly).toBe(true);

    const home = await app.inject({ method: 'GET', url: '/', cookies: { kalender_auth: cookie!.value } });
    expect(home.statusCode).toBe(200);
  });
});
