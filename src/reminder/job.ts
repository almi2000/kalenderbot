import cron, { type ScheduledTask } from 'node-cron';
import type { FastifyBaseLogger } from 'fastify';
import type { CalendarService } from '../caldav/types.js';
import { findDueReminders } from './due.js';
import { buildReminderMessage, type Notifier } from './notify.js';
import type { ReminderStore } from './store.js';

export interface ReminderJobOptions {
  calendar: CalendarService;
  store: ReminderStore;
  notifier: Notifier;
  offsetsMinutes: number[];
  allDayTime: string;
  cronExpression: string;
  timezone: string;
  logger: FastifyBaseLogger;
  now?: () => Date;
}

const DAY_MS = 86_400_000;
const KEEP_SENT_DAYS = 60;

export class ReminderJob {
  private task: ScheduledTask | null = null;
  private readonly now: () => Date;

  constructor(private readonly options: ReminderJobOptions) {
    this.now = options.now ?? (() => new Date());
  }

  /** Prüft einmal auf fällige Erinnerungen; liefert die Anzahl verschickter Nachrichten. */
  async runOnce(): Promise<number> {
    const { calendar, store, notifier, offsetsMinutes, allDayTime, logger } = this.options;
    const now = this.now();
    const maxOffsetMs = Math.max(0, ...offsetsMinutes) * 60_000;
    // Ganztagstermine beginnen um Mitternacht, werden aber zu ALLDAY_REMINDER_TIME erinnert.
    const from = new Date(now.getTime() - DAY_MS);
    const to = new Date(now.getTime() + maxOffsetMs + 2 * DAY_MS);

    const events = await calendar.listEvents(from, to);
    const due = findDueReminders(events, now, offsetsMinutes, allDayTime, (key) => store.isSent(key));

    let sent = 0;
    for (const reminder of due) {
      const message = buildReminderMessage(reminder.event, now);
      try {
        if (notifier.channels.length > 0) await notifier.send(message);
        else logger.info({ subject: message.subject }, 'Erinnerung fällig, aber kein Kanal konfiguriert');
        store.markSent(reminder.keys, now);
        sent++;
        logger.info({ uid: reminder.event.uid, subject: message.subject }, 'Erinnerung verschickt');
      } catch (error) {
        // Nicht als verschickt markieren → nächster Lauf versucht es erneut.
        logger.error({ err: error, uid: reminder.event.uid }, 'Erinnerung fehlgeschlagen');
      }
    }

    store.prune(new Date(now.getTime() - KEEP_SENT_DAYS * DAY_MS));
    return sent;
  }

  start(): void {
    const { cronExpression, timezone, logger, notifier } = this.options;
    if (!cron.validate(cronExpression)) throw new Error(`Ungültiger REMINDER_CRON-Ausdruck: "${cronExpression}"`);
    if (notifier.channels.length === 0) {
      logger.warn('Weder SMTP noch ntfy konfiguriert – Erinnerungen werden nur geloggt');
    }

    const run = () =>
      this.runOnce().catch((error: unknown) => logger.error({ err: error }, 'Erinnerungslauf fehlgeschlagen'));
    this.task = cron.schedule(cronExpression, run, { name: 'reminders', noOverlap: true, timezone });
    logger.info({ cron: cronExpression, channels: notifier.channels }, 'Erinnerungsjob gestartet');
    void run();
  }

  async stop(): Promise<void> {
    await this.task?.destroy();
    this.task = null;
  }
}
