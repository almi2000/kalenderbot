import { describe, expect, it } from 'vitest';
import { buildICalendar, parseICalendar } from './ical.js';
import type { NewEvent } from './types.js';

const NOW = new Date(Date.UTC(2026, 9, 6, 19, 30));

const base: NewEvent = {
  uid: 'test-uid-1234',
  title: 'Kino, mit Lisa; danach Essen',
  description: 'Hey, wollen wir uns am Freitag um 19 Uhr im Kino treffen?',
  date: '2026-10-09',
  time: '19:00',
  endTime: '21:30',
  important: false,
};

describe('buildICalendar', () => {
  it('erzeugt einen Termin in UTC mit Handy-Erinnerung', () => {
    const ics = buildICalendar(base, 30, NOW);
    expect(ics).toContain('DTSTART:20261009T170000Z');
    expect(ics).toContain('DTEND:20261009T193000Z');
    expect(ics).toContain('SUMMARY:Kino\\, mit Lisa\\; danach Essen');
    expect(ics).toContain('TRIGGER:-PT30M');
    expect(ics).not.toContain('CATEGORIES');
    expect(ics.split('\r\n').every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
  });

  it('markiert wichtige Termine mit Kategorie und zusätzlicher Erinnerung', () => {
    const ics = buildICalendar({ ...base, important: true }, 30, NOW);
    expect(ics).toContain('CATEGORIES:WICHTIG');
    expect(ics).toContain('TRIGGER:-P1D');
  });

  it('erzeugt Ganztagstermine als DATE-Werte', () => {
    const ics = buildICalendar({ ...base, time: null, endTime: null }, 30, NOW);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261009');
    expect(ics).toContain('DTEND;VALUE=DATE:20261010');
  });

  it('lässt Termine über Mitternacht am Folgetag enden', () => {
    const ics = buildICalendar({ ...base, time: '22:00', endTime: '01:00' }, 30, NOW);
    expect(ics).toContain('DTSTART:20261009T200000Z');
    expect(ics).toContain('DTEND:20261009T230000Z');
  });

  it('ist mit dem eigenen Parser wieder lesbar (Roundtrip)', () => {
    const ics = buildICalendar({ ...base, important: true, description: 'Zeile 1\nZeile 2 mit Ümläüten '.repeat(10) }, 30, NOW);
    const [event] = parseICalendar(ics, new Date(2026, 9, 1), new Date(2026, 10, 1));
    expect(event).toMatchObject({
      uid: 'test-uid-1234',
      title: 'Kino, mit Lisa; danach Essen',
      allDay: false,
      important: true,
    });
    expect(event?.start.toISOString()).toBe('2026-10-09T17:00:00.000Z');
    expect(event?.description).toContain('Zeile 1\nZeile 2 mit Ümläüten');
  });
});

describe('parseICalendar', () => {
  const vtimezone = [
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Berlin',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  it('expandiert wiederkehrende Termine mit Zeitzone (z. B. vom Handy angelegt)', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Test//DE',
      ...vtimezone,
      'BEGIN:VEVENT',
      'UID:weekly',
      'DTSTAMP:20260101T000000Z',
      'DTSTART;TZID=Europe/Berlin:20260105T180000',
      'DTEND;TZID=Europe/Berlin:20260105T190000',
      'RRULE:FREQ=WEEKLY;BYDAY=MO',
      'SUMMARY:! Training',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const events = parseICalendar(ics, new Date(2026, 9, 6), new Date(2026, 9, 27));
    expect(events.map((e) => e.start.toISOString())).toEqual([
      '2026-10-12T16:00:00.000Z',
      '2026-10-19T16:00:00.000Z',
      '2026-10-26T17:00:00.000Z',
    ]);
    expect(events[0]).toMatchObject({ title: 'Training', important: true });
  });

  it('ignoriert abgesagte Termine', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Test//DE',
      'BEGIN:VEVENT',
      'UID:cancelled',
      'DTSTAMP:20260101T000000Z',
      'DTSTART:20261010T100000Z',
      'DTEND:20261010T110000Z',
      'STATUS:CANCELLED',
      'SUMMARY:Abgesagt',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(parseICalendar(ics, new Date(2026, 9, 1), new Date(2026, 10, 1))).toEqual([]);
  });
});
