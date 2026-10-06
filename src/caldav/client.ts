import { DAVClient, type DAVCalendar } from 'tsdav';
import type { AppConfig } from '../config.js';
import { buildICalendar, parseICalendar } from './ical.js';
import type { CalendarEvent, CalendarService, NewEvent } from './types.js';

interface Connection {
  client: DAVClient;
  calendar: DAVCalendar;
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

/** CalDAV-Anbindung an Radicale; legt den Kalender beim ersten Zugriff automatisch an. */
export class CalDavCalendar implements CalendarService {
  private connection: Connection | null = null;
  private connecting: Promise<Connection> | null = null;

  constructor(
    private readonly config: AppConfig['caldav'],
    private readonly phoneAlarmMinutes: number,
  ) {}

  private async connect(): Promise<Connection> {
    const client = new DAVClient({
      serverUrl: this.config.url,
      credentials: { username: this.config.user, password: this.config.password },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });
    await client.login();

    const homeUrl = client.account?.homeUrl;
    if (!homeUrl) throw new Error('CalDAV-Server liefert kein Kalender-Verzeichnis (calendar-home-set)');
    const targetUrl = new URL(`${this.config.calendarSlug}/`, ensureTrailingSlash(homeUrl)).href;
    const find = (calendars: DAVCalendar[]) =>
      calendars.find((calendar) => ensureTrailingSlash(new URL(calendar.url, homeUrl).href) === targetUrl);

    let calendar = find(await client.fetchCalendars());
    if (!calendar) {
      await client.makeCalendar({
        url: targetUrl,
        props: {
          'd:displayname': this.config.calendarName,
          'c:supported-calendar-component-set': { 'c:comp': { _attributes: { name: 'VEVENT' } } },
        },
      });
      calendar = find(await client.fetchCalendars());
      if (!calendar) throw new Error(`Kalender ${targetUrl} konnte nicht angelegt werden`);
    }
    return { client, calendar };
  }

  private async getConnection(): Promise<Connection> {
    if (this.connection) return this.connection;
    this.connecting ??= this.connect()
      .then((connection) => {
        this.connection = connection;
        return connection;
      })
      .finally(() => {
        this.connecting = null;
      });
    return this.connecting;
  }

  /** Bei Verbindungsfehlern einmal neu anmelden (z. B. nach Neustart von Radicale). */
  private async withConnection<T>(action: (connection: Connection) => Promise<T>): Promise<T> {
    try {
      return await action(await this.getConnection());
    } catch (error) {
      if (!this.connection) throw error;
      this.connection = null;
      return action(await this.getConnection());
    }
  }

  async createEvent(event: NewEvent): Promise<void> {
    const iCalString = buildICalendar(event, this.phoneAlarmMinutes);
    await this.withConnection(async ({ client, calendar }) => {
      const response = await client.createCalendarObject({
        calendar,
        filename: `${event.uid}.ics`,
        iCalString,
        // Gleiche UID erneut speichern = überschreiben (z. B. Doppelklick, Korrektur).
        headersToExclude: ['If-None-Match'],
      });
      if (!response.ok) throw new Error(`CalDAV-Server antwortet mit ${response.status} ${response.statusText}`);
    });
  }

  async listEvents(from: Date, to: Date): Promise<CalendarEvent[]> {
    const objects = await this.withConnection(({ client, calendar }) =>
      client.fetchCalendarObjects({
        calendar,
        timeRange: { start: from.toISOString(), end: to.toISOString() },
      }),
    );
    return objects
      .flatMap((object) => (typeof object.data === 'string' ? parseICalendar(object.data, from, to) : []))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }
}
