export const calendarTables = `
  CREATE TABLE calendars(id TEXT PRIMARY KEY, name TEXT NOT NULL);
  INSERT INTO calendars VALUES('default','默认日历');
  CREATE TABLE event_calendars(
    event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    calendar_id TEXT NOT NULL REFERENCES calendars(id)
  );
  CREATE INDEX calendar_members ON event_calendars(calendar_id);
`;
