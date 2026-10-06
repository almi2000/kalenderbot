import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CalDavCalendar } from './client.js';

// Läuft nur gegen einen echten Server, z. B.:
// CALDAV_TEST_URL=http://127.0.0.1:5232/ CALDAV_TEST_USER=ich CALDAV_TEST_PASSWORD=... npx vitest run
const url = process.env.CALDAV_TEST_URL;

describe.skipIf(!url)('CalDavCalendar (Integration)', () => {
  const calendar = new CalDavCalendar(
    {
      url: url ?? '',
      user: process.env.CALDAV_TEST_USER ?? '',
      password: process.env.CALDAV_TEST_PASSWORD ?? '',
      calendarSlug: `test-${Date.now()}`,
      calendarName: 'Integrationstest',
    },
    30,
  );

  it('legt Kalender und Termine an und liest sie wieder', async () => {
    const uid = randomUUID();
    const event = {
      uid,
      title: 'Zahnarzt',
      description: 'Zahnarzt am Montag um 9',
      date: '2026-10-12',
      time: '09:00',
      endTime: '10:00',
      important: true,
    };
    await calendar.createEvent(event);
    // Gleiche UID erneut speichern überschreibt den Termin
    await calendar.createEvent({ ...event, title: 'Zahnarzt Dr. Müller' });
    await calendar.createEvent({ ...event, uid: randomUUID(), title: 'Geburtstag', time: null, endTime: null, important: false });

    const events = await calendar.listEvents(new Date(2026, 9, 12), new Date(2026, 9, 13));
    expect(events).toHaveLength(2);
    expect(events.find((e) => e.uid === uid)).toMatchObject({
      title: 'Zahnarzt Dr. Müller',
      important: true,
      allDay: false,
      start: new Date(2026, 9, 12, 9, 0),
    });
    expect(events.find((e) => e.title === 'Geburtstag')).toMatchObject({ allDay: true, important: false });

    expect(await calendar.listEvents(new Date(2026, 9, 13), new Date(2026, 9, 20))).toHaveLength(0);
  });
});
