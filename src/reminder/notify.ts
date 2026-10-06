import nodemailer, { type Transporter } from 'nodemailer';
import type { CalendarEvent } from '../caldav/types.js';
import type { NtfyConfig, SmtpConfig } from '../config.js';
import { formatTime, formatWhen } from '../format.js';

export interface ReminderMessage {
  subject: string;
  text: string;
}

export interface Notifier {
  readonly channels: string[];
  send(message: ReminderMessage): Promise<void>;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function relativeDay(start: Date, now: Date): string | null {
  const days = Math.round((startOfDay(start) - startOfDay(now)) / 86_400_000);
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  if (days === 2) return 'übermorgen';
  return null;
}

function countdown(start: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((start.getTime() - now.getTime()) / 60_000));
  if (minutes < 60) return `in ${minutes} Minute${minutes === 1 ? '' : 'n'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `in ${hours} Stunde${hours === 1 ? '' : 'n'}`;
  return `in ${Math.round(hours / 24)} Tagen`;
}

/** Text bezieht sich auf die tatsächliche Restzeit, nicht auf die konfigurierte Vorlaufzeit. */
export function buildReminderMessage(event: CalendarEvent, now: Date): ReminderMessage {
  const day = relativeDay(event.start, now);
  const shortWhen = event.allDay
    ? (day ?? formatWhen(event.start, true).replace(' (ganztägig)', ''))
    : `${day ?? formatWhen(event.start, true).replace(' (ganztägig)', '')}, ${formatTime(event.start)} Uhr`;

  const when = event.allDay
    ? formatWhen(event.start, true, true)
    : `${formatWhen(event.start, false, true)} (${countdown(event.start, now)})`;

  const lines = ['Erinnerung an deinen Termin:', '', event.title, when];
  if (event.description) lines.push('', event.description);
  return { subject: `⏰ ${event.title} – ${shortWhen}`, text: lines.join('\n') };
}

class MailChannel {
  private readonly transport: Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password } : undefined,
    });
  }

  async send(message: ReminderMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.config.from,
      to: this.config.to,
      subject: message.subject,
      text: message.text,
    });
  }
}

class NtfyChannel {
  constructor(private readonly config: NtfyConfig) {}

  async send(message: ReminderMessage): Promise<void> {
    // JSON-Variante, weil HTTP-Header (Title) keine Umlaute erlauben.
    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.config.token ? { authorization: `Bearer ${this.config.token}` } : {}),
      },
      body: JSON.stringify({
        topic: this.config.topic,
        title: message.subject,
        message: message.text,
        priority: 4,
        tags: ['calendar'],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`ntfy antwortet mit ${response.status} ${await response.text()}`);
  }
}

/** Verschickt über alle konfigurierten Kanäle; scheitert nur, wenn kein Kanal funktioniert. */
export class MultiNotifier implements Notifier {
  private readonly targets: Array<{ name: string; send(message: ReminderMessage): Promise<void> }> = [];

  constructor(smtp: SmtpConfig | null, ntfy: NtfyConfig | null) {
    if (smtp) {
      const mail = new MailChannel(smtp);
      this.targets.push({ name: 'E-Mail', send: (m) => mail.send(m) });
    }
    if (ntfy) {
      const push = new NtfyChannel(ntfy);
      this.targets.push({ name: 'ntfy', send: (m) => push.send(m) });
    }
  }

  get channels(): string[] {
    return this.targets.map((target) => target.name);
  }

  async send(message: ReminderMessage): Promise<void> {
    const results = await Promise.allSettled(this.targets.map((target) => target.send(message)));
    const failures = results.flatMap((result, index) =>
      result.status === 'rejected' ? [`${this.targets[index]!.name}: ${(result.reason as Error).message}`] : [],
    );
    if (failures.length > 0 && failures.length === this.targets.length) {
      throw new Error(`Erinnerung konnte nicht verschickt werden – ${failures.join('; ')}`);
    }
  }
}
