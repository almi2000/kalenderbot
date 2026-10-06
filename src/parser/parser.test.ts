import { describe, expect, it } from 'vitest';
import { parseMessage, prefilter } from './index.js';

// Dienstag, 06.10.2026, 21:30 Uhr
const NOW = new Date(2026, 9, 6, 21, 30);

interface Expectation {
  text: string;
  date: string;
  time: string | null;
  endTime?: string | null;
  title: string;
}

const appointments: Expectation[] = [
  { text: 'Zahnarzt am Montag um 9', date: '2026-10-12', time: '09:00', title: 'Zahnarzt' },
  {
    text: 'Hey, wollen wir uns am Freitag um 19 Uhr im Kino treffen?',
    date: '2026-10-09',
    time: '19:00',
    title: 'Kino treffen',
  },
  { text: 'Treffen am 12.10. um 14:30', date: '2026-10-12', time: '14:30', title: 'Treffen' },
  { text: 'Treffen am 12.10.2026 14:30', date: '2026-10-12', time: '14:30', title: 'Treffen' },
  { text: 'Party am 12. Oktober ab 18 Uhr', date: '2026-10-12', time: '18:00', title: 'Party' },
  { text: 'morgen um 14 Uhr Meeting', date: '2026-10-07', time: '14:00', title: 'Meeting' },
  { text: 'übermorgen Grillen', date: '2026-10-08', time: null, title: 'Grillen' },
  { text: 'nächsten Dienstag Elternabend', date: '2026-10-13', time: null, title: 'Elternabend' },
  { text: 'Mo. 10 Uhr Arzt', date: '2026-10-12', time: '10:00', title: 'Arzt' },
  { text: 'heute Abend Essen bei Oma', date: '2026-10-06', time: '19:00', title: 'Essen bei Oma' },
  {
    text: 'Freitag von 14 bis 16 Uhr Workshop',
    date: '2026-10-09',
    time: '14:00',
    endTime: '16:00',
    title: 'Workshop',
  },
  { text: 'um halb drei beim Bäcker', date: '2026-10-07', time: '14:30', title: 'Bäcker' },
  { text: 'am 3.11. Geburtstag von Lisa', date: '2026-11-03', time: null, title: 'Geburtstag von Lisa' },
  { text: 'Termin 24.12.', date: '2026-12-24', time: null, title: 'Termin' },
  { text: 'Am 5.1. Zahnreinigung', date: '2027-01-05', time: null, title: 'Zahnreinigung' },
  { text: 'Am Wochenende Ausflug zum See', date: '2026-10-10', time: null, title: 'Ausflug zum See' },
  { text: 'Samstag 20:00 Konzert', date: '2026-10-10', time: '20:00', title: 'Konzert' },
  { text: 'Kino um 15.30 Uhr', date: '2026-10-07', time: '15:30', title: 'Kino' },
  { text: 'Fußball am Donnerstag um 6', date: '2026-10-08', time: '18:00', title: 'Fußball' },
  { text: 'Donnerstag früh um 6 Joggen', date: '2026-10-08', time: '06:00', title: 'Joggen' },
  {
    text: 'Freitag abends so gegen 8 Grillen bei Tom',
    date: '2026-10-09',
    time: '20:00',
    title: 'Grillen bei Tom',
  },
  {
    text: 'Mittwoch um viertel nach vier Elterngespräch',
    date: '2026-10-07',
    time: '16:15',
    title: 'Elterngespräch',
  },
  {
    text: 'Nicht vergessen: Steuerberater am Donnerstag, 15.10. um 11 Uhr 👍',
    date: '2026-10-15',
    time: '11:00',
    title: 'Steuerberater',
  },
  { text: 'Zahnarzt morgen um 10:15 bei Dr. Weber', date: '2026-10-07', time: '10:15', title: 'Zahnarzt bei Dr. Weber' },
];

describe('parseMessage – erkannte Termine', () => {
  it.each(appointments)('$text', ({ text, date, time, endTime, title }) => {
    const result = parseMessage(text, NOW);
    expect(result.primary).not.toBeNull();
    expect(result.primary?.date).toBe(date);
    expect(result.primary?.time).toBe(time);
    if (endTime !== undefined) expect(result.primary?.endTime).toBe(endTime);
    expect(result.title).toBe(title);
    expect(result.prefilter.matched).toBe(true);
  });
});

describe('parseMessage – keine Termine', () => {
  it.each(['Guten Morgen! Wie geht es dir?', 'So geht das nicht', 'Hallo, alles klar bei dir?', 'Danke dir 😊'])(
    '%s',
    (text) => {
      const result = parseMessage(text, NOW);
      expect(result.primary).toBeNull();
      expect(result.prefilter.matched).toBe(false);
    },
  );
});

describe('parseMessage – Sonderfälle', () => {
  it('liefert weitere erkannte Angaben als Alternativen', () => {
    const result = parseMessage('Montag geht bei mir nicht, aber Dienstag um 10 Uhr', NOW);
    expect(result.primary).toMatchObject({ date: '2026-10-13', time: '10:00' });
    expect(result.alternatives).toContainEqual(expect.objectContaining({ date: '2026-10-12', time: null }));
  });

  it('markiert nur-Uhrzeit-Angaben als abgeleitetes Datum', () => {
    const result = parseMessage('um 18 Uhr Training', NOW);
    expect(result.primary).toMatchObject({ date: '2026-10-07', time: '18:00', dateFromMessage: false });
  });

  it('erkennt Termine in der Vergangenheit', () => {
    const result = parseMessage('heute um 10 Uhr Meeting', NOW);
    expect(result.primary).toMatchObject({ date: '2026-10-06', time: '10:00' });
    expect(result.inPast).toBe(true);
  });

  it('verwendet "Termin" als Titel, wenn nichts übrig bleibt', () => {
    expect(parseMessage('Am Montag um 9?', NOW).title).toBe('Termin');
  });
});

describe('prefilter', () => {
  it.each([
    ['Montag war echt anstrengend', ['wochentag']],
    ['Bis morgen um 8', ['uhrzeit', 'relativ']],
    ['12.10. Party', ['datum']],
    ['Treffen am 3. Oktober', ['datum']],
    ['Mi. 14:30 Arzt', ['wochentag', 'uhrzeit']],
    ['um halb drei', ['uhrzeit']],
    ['übermorgen', ['relativ']],
  ])('%s', (text, reasons) => {
    expect(prefilter(text)).toEqual({ matched: true, reasons });
  });

  it.each(['Guten Morgen', 'So machen wir das', 'Hallo zusammen', 'Ich habe 2 Katzen'])('%s → kein Treffer', (text) => {
    expect(prefilter(text).matched).toBe(false);
  });
});
