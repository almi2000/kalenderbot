export interface NewEvent {
  /** Wird als Dateiname genutzt; erneutes Speichern mit derselben UID überschreibt statt zu duplizieren. */
  uid: string;
  title: string;
  description: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, null = ganztägig */
  time: string | null;
  /** HH:MM */
  endTime: string | null;
  important: boolean;
}

export interface CalendarEvent {
  uid: string;
  title: string;
  description: string;
  start: Date;
  end: Date;
  allDay: boolean;
  important: boolean;
}

export interface CalendarService {
  createEvent(event: NewEvent): Promise<void>;
  /** Termine (inkl. Wiederholungen), die im Zeitraum [from, to) beginnen. */
  listEvents(from: Date, to: Date): Promise<CalendarEvent[]>;
}
