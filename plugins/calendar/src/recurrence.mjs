function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('日期无效');
  const date = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw Error('日期无效');
  return date;
}

// Expand local calendar dates. The caller resolves the event's time and zone.
function* scheduledDates(start, rule, through, since = start) {
  const origin = parseDate(start);
  let end = parseDate(through);
  const {frequency, interval = 1, count, until} = rule;
  if (!['daily','weekly','monthly','yearly'].includes(frequency) ||
      !Number.isSafeInteger(interval) || interval < 1 ||
      (count !== undefined && (!Number.isSafeInteger(count) || count < 1 || until !== undefined))) {
    throw Error('重复规则无效');
  }
  if (until !== undefined) {
    const cutoff = parseDate(until);
    if (cutoff < end) end = cutoff;
  }
  let emitted = 0;
  const day = origin.getUTCDate();
  let firstStep = 0;
  if (frequency === 'daily' || frequency === 'weekly') {
    const days = (parseDate(since) - origin) / 86400000;
    emitted = Math.max(0, Math.ceil(days / (interval * (frequency === 'weekly' ? 7 : 1))));
    if (count !== undefined && emitted >= count) return;
    firstStep = emitted * interval;
  }
  for (let step = firstStep; ; step += interval) {
    const candidate = new Date(origin);
    if (frequency === 'daily' || frequency === 'weekly') {
      candidate.setUTCDate(day + step * (frequency === 'weekly' ? 7 : 1));
    } else {
      candidate.setUTCMonth(origin.getUTCMonth() + step * (frequency === 'yearly' ? 12 : 1), day);
    }
    if (!Number.isFinite(candidate.valueOf()) || candidate > end) break;
    if ((frequency === 'monthly' || frequency === 'yearly') && candidate.getUTCDate() !== day) continue;
    yield candidate.toISOString().slice(0,10);
    if (++emitted === count) break;
  }
}

export function occurrenceDates(start, rule, through) {
  return Array.from(scheduledDates(start, rule, through));
}

// Exceptions are keyed by the original local date. A null value cancels that instance.
export function calendarOccurrences(start, rule, through, exceptions = {}, since = '0000-01-01') {
  parseDate(through);
  let horizon = through;
  let earliest = since;
  for (const [original, moved] of Object.entries(exceptions)) {
    parseDate(original);
    if (moved === null) continue;
    parseDate(moved);
    // A later instance can be moved back into the requested range.
    if (moved >= since && moved <= through) {
      if (original > horizon) horizon = original;
      if (original < earliest) earliest = original;
    }
  }
  const occurrences = [];
  for (const originalDate of scheduledDates(start, rule, horizon, earliest)) {
    const date = Object.hasOwn(exceptions, originalDate) ? exceptions[originalDate] : originalDate;
    if (date !== null && date <= through && date >= since) occurrences.push({originalDate, date});
  }
  return occurrences.sort((a,b) => a.date.localeCompare(b.date) || a.originalDate.localeCompare(b.originalDate));
}

function localEndpoint(date,time,zone){
  parseDate(date);
  if(typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('当地时间无效');
  return Temporal.PlainDateTime.from(date+'T'+time).toZonedDateTime(zone,{disambiguation:'compatible'});
}

function creationZone(timeZone){
  if(typeof timeZone!=='string'||!timeZone.trim())throw Error('时区无效');
  return new Intl.DateTimeFormat('en',{timeZone}).resolvedOptions().timeZone;
}

export function timedSpan({start,time,end,endTime,timeZone}){
  const zone=creationZone(timeZone);
  const from=localEndpoint(start,time,zone);
  const to=localEndpoint(end,endTime,zone);
  if(Temporal.ZonedDateTime.compare(from,to)>=0)throw Error('结束时间须晚于开始时间');
  return occupiedSpan(from,to);
}

function occupiedSpan(from,to){
  return {
    startInstant:from.toInstant().toString(),
    endInstant:to.toInstant().toString(),
    firstDay:from.toPlainDate().toString(),
    lastDay:to.subtract({nanoseconds:1}).toPlainDate().toString()
  };
}

// Resolve each edited local date separately so a series follows its creation zone.
export function timedOccurrences({start,time,end,endTime,timeZone,rule,exceptions},through,fromDay){
  const zone=creationZone(timeZone);
  localEndpoint(start,time,zone);
  const hasEnd=end!==undefined||endTime!==undefined;
  let dayOffset=0;
  if(hasEnd){
    const wallStart=Temporal.PlainDateTime.from(start+'T'+time);
    const wallEnd=Temporal.PlainDateTime.from(end+'T'+endTime);
    if(Temporal.PlainDateTime.compare(wallStart,wallEnd)>=0)throw Error('系列结束时间须晚于开始时间');
    timedSpan({start,time,end,endTime,timeZone:zone});
    dayOffset=Temporal.PlainDate.from(start).until(Temporal.PlainDate.from(end)).days;
  }
  // Include spans starting before the visible range, including zone offset jumps.
  const earliest=fromDay&&Temporal.PlainDate.from(fromDay).subtract({days:dayOffset+2});
  const since=earliest?(earliest.year<0?'0000-01-01':earliest.toString()):undefined;
  return calendarOccurrences(start,rule,through,exceptions,since).map(occurrence=>{
    if(!hasEnd)return {...occurrence,instant:localEndpoint(occurrence.date,time,zone).toInstant().toString()};
    const last=Temporal.PlainDate.from(occurrence.date).add({days:dayOffset}).toString();
    const from=localEndpoint(occurrence.date,time,zone);
    let to=localEndpoint(last,endTime,zone);
    if(Temporal.ZonedDateTime.compare(from,to)>=0){
      // A gap can advance the start past the separately resolved end.
      const wallStart=Temporal.PlainDateTime.from(occurrence.date+'T'+time);
      const wallEnd=Temporal.PlainDateTime.from(last+'T'+endTime);
      to=from.add(wallStart.until(wallEnd,{largestUnit:'hour'}));
    }
    const span=occupiedSpan(from,to);
    return {...occurrence,instant:span.startInstant,...span};
  });
}

// Day views can check daily and weekly series without expanding their history.
export function occursOn(start,rule,day){
  const first=parseDate(start), target=parseDate(day);
  if(day<start || (rule.until && day>rule.until))return false;
  const interval=rule.interval??1;
  if(rule.frequency==='daily'||rule.frequency==='weekly'){
    const days=(target-first)/86400000;
    const index=days/(interval*(rule.frequency==='weekly'?7:1));
    return Number.isInteger(index)&&(rule.count===undefined||index<rule.count);
  }
  if(first.getUTCDate()!==target.getUTCDate())return false;
  const months=(target.getUTCFullYear()-first.getUTCFullYear())*12+target.getUTCMonth()-first.getUTCMonth();
  if(months%(interval*(rule.frequency==='yearly'?12:1))!==0)return false;
  if(rule.count===undefined)return true;
  for(const date of scheduledDates(start,rule,day))if(date===day)return true;
  return false;
}

// Return every instance sharing the first deadline strictly after the cursor.
// Moved instances keep their original date as their durable occurrence identity.
export function nextSeriesReminder(timing,rule,minutesBefore,after){
  if(!Number.isSafeInteger(minutesBefore)||minutesBefore<0||!Number.isSafeInteger(after))
    throw Error('提醒时间无效');
  const offset=minutesBefore*60000;
  const boundary=Temporal.Instant.fromEpochMilliseconds(after+offset)
    .toZonedDateTimeISO(timing.timeZone).toPlainDate().subtract({days:1});
  const since=boundary.year<0?'0000-01-01':boundary.toString();
  const cancelled=new Set(rule.cancelled??[]);
  const moved=rule.moved??{};
  let deadline=null;
  let originals=[];
  function consider(original,date){
    const instant=localEndpoint(date,timing.time,timing.timeZone).epochMilliseconds-offset;
    if(instant<=after)return;
    if(deadline===null||instant<deadline){deadline=instant;originals=[];}
    if(instant===deadline)originals.push(original);
    return instant;
  }
  for(const [original,date] of Object.entries(moved)){
    if(date>=since&&!cancelled.has(original)&&occursOn(timing.start,rule,original))consider(original,date);
  }
  for(const original of scheduledDates(timing.start,rule,'9999-12-31',since)){
    if(original<since||cancelled.has(original)||Object.hasOwn(moved,original))continue;
    const instant=consider(original,original);
    if(instant!==undefined&&instant>deadline)break;
  }
  return deadline===null?null:{deadline,originals:originals.sort()};
}
