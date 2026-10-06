import { DAVClient } from 'tsdav';
import { buildICalendar, parseICalendar } from './ical.js';
function ensureTrailingSlash(url) {
    return url.endsWith('/') ? url : `${url}/`;
}
/** CalDAV-Anbindung an Radicale; legt den Kalender beim ersten Zugriff automatisch an. */
export class CalDavCalendar {
    config;
    phoneAlarmMinutes;
    connection = null;
    connecting = null;
    constructor(config, phoneAlarmMinutes) {
        this.config = config;
        this.phoneAlarmMinutes = phoneAlarmMinutes;
    }
    async connect() {
        const client = new DAVClient({
            serverUrl: this.config.url,
            credentials: { username: this.config.user, password: this.config.password },
            authMethod: 'Basic',
            defaultAccountType: 'caldav',
        });
        await client.login();
        const homeUrl = client.account?.homeUrl;
        if (!homeUrl)
            throw new Error('CalDAV-Server liefert kein Kalender-Verzeichnis (calendar-home-set)');
        const targetUrl = new URL(`${this.config.calendarSlug}/`, ensureTrailingSlash(homeUrl)).href;
        const find = (calendars) => calendars.find((calendar) => ensureTrailingSlash(new URL(calendar.url, homeUrl).href) === targetUrl);
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
            if (!calendar)
                throw new Error(`Kalender ${targetUrl} konnte nicht angelegt werden`);
        }
        return { client, calendar };
    }
    async getConnection() {
        if (this.connection)
            return this.connection;
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
    async withConnection(action) {
        try {
            return await action(await this.getConnection());
        }
        catch (error) {
            if (!this.connection)
                throw error;
            this.connection = null;
            return action(await this.getConnection());
        }
    }
    async createEvent(event) {
        const iCalString = buildICalendar(event, this.phoneAlarmMinutes);
        await this.withConnection(async ({ client, calendar }) => {
            const response = await client.createCalendarObject({
                calendar,
                filename: `${event.uid}.ics`,
                iCalString,
                // Gleiche UID erneut speichern = überschreiben (z. B. Doppelklick, Korrektur).
                headersToExclude: ['If-None-Match'],
            });
            if (!response.ok)
                throw new Error(`CalDAV-Server antwortet mit ${response.status} ${response.statusText}`);
        });
    }
    async listEvents(from, to) {
        const objects = await this.withConnection(({ client, calendar }) => client.fetchCalendarObjects({
            calendar,
            timeRange: { start: from.toISOString(), end: to.toISOString() },
        }));
        return objects
            .flatMap((object) => (typeof object.data === 'string' ? parseICalendar(object.data, from, to) : []))
            .sort((a, b) => a.start.getTime() - b.start.getTime());
    }
}
//# sourceMappingURL=client.js.map