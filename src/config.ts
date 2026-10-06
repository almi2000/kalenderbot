export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  to: string;
}

export interface NtfyConfig {
  url: string;
  topic: string;
  token: string;
}

export interface AppConfig {
  port: number;
  host: string;
  publicUrl: string;
  appToken: string;
  timezone: string;
  dataDir: string;
  caldav: {
    url: string;
    user: string;
    password: string;
    calendarSlug: string;
    calendarName: string;
  };
  defaultDurationMinutes: number;
  phoneAlarmMinutes: number;
  reminderOffsetsMinutes: number[];
  allDayReminderTime: string;
  reminderCron: string;
  smtp: SmtpConfig | null;
  ntfy: NtfyConfig | null;
}

function str(name: string, fallback = ''): string {
  return process.env[name]?.trim() ?? fallback;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) throw new Error(`Umgebungsvariable ${name} ist keine Zahl: "${raw}"`);
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'ja'].includes(raw);
}

function offsets(name: string, fallback: number[]): number[] {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const values = raw
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  return [...new Set(values)].sort((a, b) => b - a);
}

export function loadConfig(): AppConfig {
  const timezone = str('TZ', 'Europe/Berlin');
  // Alle Datumsberechnungen (Parser, iCalendar) arbeiten in lokaler Zeit des Prozesses.
  process.env.TZ = timezone;

  const smtpHost = str('SMTP_HOST');
  const smtp: SmtpConfig | null = smtpHost
    ? {
        host: smtpHost,
        port: int('SMTP_PORT', 587),
        secure: bool('SMTP_SECURE', false),
        user: str('SMTP_USER'),
        password: str('SMTP_PASSWORD'),
        from: str('MAIL_FROM', str('SMTP_USER')),
        to: str('MAIL_TO'),
      }
    : null;
  if (smtp && !smtp.to) throw new Error('MAIL_TO muss gesetzt sein, wenn SMTP_HOST gesetzt ist');

  const ntfyUrl = str('NTFY_URL');
  const ntfy: NtfyConfig | null =
    ntfyUrl && str('NTFY_TOPIC')
      ? { url: ntfyUrl.replace(/\/+$/, ''), topic: str('NTFY_TOPIC'), token: str('NTFY_TOKEN') }
      : null;

  return {
    port: int('PORT', 3000),
    host: str('HOST', '0.0.0.0'),
    publicUrl: str('PUBLIC_URL', 'http://localhost:3000').replace(/\/+$/, ''),
    appToken: str('APP_TOKEN'),
    timezone,
    dataDir: str('DATA_DIR', './data'),
    caldav: {
      url: str('CALDAV_URL', 'http://localhost:5232/'),
      user: str('CALDAV_USER'),
      password: str('CALDAV_PASSWORD'),
      calendarSlug: str('CALDAV_CALENDAR', 'termine'),
      calendarName: str('CALDAV_CALENDAR_NAME', 'Termine'),
    },
    defaultDurationMinutes: int('DEFAULT_DURATION_MINUTES', 60),
    phoneAlarmMinutes: int('PHONE_ALARM_MINUTES', 30),
    reminderOffsetsMinutes: offsets('REMINDER_OFFSETS_MINUTES', [1440, 60]),
    allDayReminderTime: str('ALLDAY_REMINDER_TIME', '08:00'),
    reminderCron: str('REMINDER_CRON', '*/5 * * * *'),
    smtp,
    ntfy,
  };
}
