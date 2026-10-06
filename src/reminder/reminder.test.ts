import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { CalendarEvent, CalendarService } from '../caldav/types.js';
import { findDueReminders } from './due.js';
import { ReminderJob } from './job.js';
import { buildReminderMessage, type Notifier, type ReminderMessage } from './notify.js';
import { ReminderStore } from './store.js';

const OFFSETS = [1440, 60];

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    uid: 'zahnarzt',
    title: 'Zahnarzt',
    description: '',
    start: new Date(2026, 9, 12, 9, 0),
    end: new Date(2026, 9, 12, 10, 0),
    allDay: false,
    important: true,
    ...overrides,
  };
}

describe('findDueReminders', () => {
  const never = () => false;

  it('ist vor der ersten Vorlaufzeit nicht fällig', () => {
    expect(findDueReminders([event()], new Date(2026, 9, 11, 8, 59), OFFSETS, '08:00', never)).toEqual([]);
  });

  it('wird 1 Tag vorher fällig', () => {
    const [due] = findDueReminders([event()], new Date(2026, 9, 11, 9, 0), OFFSETS, '08:00', never);
    expect(due?.offsetMinutes).toBe(1440);
  });

  it('verschickt bei mehreren fälligen Stufen nur eine Nachricht', () => {
    const due = findDueReminders([event()], new Date(2026, 9, 12, 8, 30), OFFSETS, '08:00', never);
    expect(due).toHaveLength(1);
    expect(due[0]?.offsetMinutes).toBe(60);
    expect(due[0]?.keys).toHaveLength(2);
  });

  it('ignoriert unwichtige, vergangene und bereits erinnerte Termine', () => {
    const now = new Date(2026, 9, 12, 8, 30);
    expect(findDueReminders([event({ important: false })], now, OFFSETS, '08:00', never)).toEqual([]);
    expect(findDueReminders([event()], new Date(2026, 9, 12, 9, 1), OFFSETS, '08:00', never)).toEqual([]);
    expect(findDueReminders([event()], now, OFFSETS, '08:00', () => true)).toEqual([]);
  });

  it('rechnet bei Ganztagsterminen ab der eingestellten Uhrzeit', () => {
    const allDay = event({ allDay: true, start: new Date(2026, 9, 12), end: new Date(2026, 9, 13) });
    expect(findDueReminders([allDay], new Date(2026, 9, 11, 7, 59), OFFSETS, '08:00', never)).toEqual([]);
    expect(findDueReminders([allDay], new Date(2026, 9, 11, 8, 0), OFFSETS, '08:00', never)).toHaveLength(1);
  });
});

describe('buildReminderMessage', () => {
  it('beschreibt die tatsächliche Restzeit', () => {
    const message = buildReminderMessage(event({ description: 'WhatsApp: Zahnarzt am Montag um 9' }), new Date(2026, 9, 12, 8, 0));
    expect(message.subject).toBe('⏰ Zahnarzt – heute, 09:00 Uhr');
    expect(message.text).toContain('Montag, 12. Oktober 2026, 09:00 Uhr (in 1 Stunde)');
    expect(message.text).toContain('WhatsApp: Zahnarzt am Montag um 9');
  });

  it('nennt "morgen" bei Ganztagsterminen', () => {
    const allDay = event({ title: 'Geburtstag Lisa', allDay: true, start: new Date(2026, 9, 12) });
    expect(buildReminderMessage(allDay, new Date(2026, 9, 11, 8, 0)).subject).toBe('⏰ Geburtstag Lisa – morgen');
  });
});

class StaticCalendar implements CalendarService {
  constructor(private readonly events: CalendarEvent[]) {}
  async createEvent(): Promise<void> {}
  async listEvents(): Promise<CalendarEvent[]> {
    return this.events;
  }
}

class RecordingNotifier implements Notifier {
  readonly channels = ['test'];
  messages: ReminderMessage[] = [];
  failNext = false;
  async send(message: ReminderMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('SMTP down');
    }
    this.messages.push(message);
  }
}

describe('ReminderJob', () => {
  it('verschickt jede Erinnerung genau einmal und wiederholt Fehlschläge', async () => {
    let now = new Date(2026, 9, 11, 9, 2);
    const notifier = new RecordingNotifier();
    const store = new ReminderStore(':memory:');
    const job = new ReminderJob({
      calendar: new StaticCalendar([event()]),
      store,
      notifier,
      offsetsMinutes: OFFSETS,
      allDayTime: '08:00',
      cronExpression: '*/5 * * * *',
      timezone: 'Europe/Berlin',
      logger: Fastify({ logger: false }).log,
      now: () => now,
    });

    notifier.failNext = true;
    expect(await job.runOnce()).toBe(0);
    expect(await job.runOnce()).toBe(1);
    expect(await job.runOnce()).toBe(0);
    expect(notifier.messages.map((m) => m.subject)).toEqual(['⏰ Zahnarzt – morgen, 09:00 Uhr']);

    now = new Date(2026, 9, 12, 8, 1);
    expect(await job.runOnce()).toBe(1);
    expect(notifier.messages[1]?.subject).toBe('⏰ Zahnarzt – heute, 09:00 Uhr');
    store.close();
  });
});
