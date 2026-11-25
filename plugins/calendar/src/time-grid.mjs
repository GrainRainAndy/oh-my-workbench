const minute=time=>Number(time.slice(0,2))*60+Number(time.slice(3,5));

// The range service returns one row per occupied creation-zone date.
export function localTimelineRows(rows,dates,zone){
  const result=[],occurrences=new Map();
  for(const row of rows){
    const timing=row.timing;
    if(!timing?.startInstant||!timing.endInstant){result.push(row);continue;}
    const identity=JSON.stringify([row.id,row.originalDay,timing.startInstant]);
    if(!occurrences.has(identity))occurrences.set(identity,new Map());
    occurrences.get(identity).set(row.day,row);
  }
  for(const sources of occurrences.values()){
    const row=sources.values().next().value;
    const timing=row.timing;
    const from=Temporal.Instant.from(timing.startInstant).toZonedDateTimeISO(zone);
    const to=Temporal.Instant.from(timing.endInstant).toZonedDateTimeISO(zone);
    const start=from.toPlainDate().toString(),end=to.toPlainDate().toString();
    const last=to.subtract({nanoseconds:1}).toPlainDate().toString();
    const displayTiming={...timing,start,end,time:from.toPlainTime().toString({smallestUnit:'minute'}),
      endTime:to.toPlainTime().toString({smallestUnit:'minute'}),timeZone:zone};
    if(start===end&&from.offsetNanoseconds>to.offsetNanoseconds){
      const transition=from.getTimeZoneTransition('next');
      const after=transition.hour*60+transition.minute;
      const before=after+(from.offsetNanoseconds-transition.offsetNanoseconds)/60e9;
      displayTiming.wallClockIntervals=[[minute(displayTiming.time),before],[after,minute(displayTiming.endTime)]];
    }
    for(const day of dates){
      if(day>=start&&day<=last)result.push({...row,day,timing:displayTiming,source:sources.get(day)??row});
    }
  }
  return result;
}

export function positionEvents(rows,day){
  const blocks=rows.filter(row=>row.timing&&row.day===day).flatMap(row=>{
    const t=row.timing;
    const start=day===t.start?minute(t.time):0;
    const end=day===t.end?minute(t.endTime):1440;
    if(t.wallClockIntervals){
      return t.wallClockIntervals.filter(([start,end])=>end>start).map(([start,end])=>({row,start,end}));
    }
    return [{row,start,end:Math.min(1440,Math.max(start+1,end))}];
  }).sort((a,b)=>a.start-b.start||b.end-a.end);
  let group=[],ends=[];
  function finish(){
    for(const block of group)block.columns=ends.length;
    group=[];ends=[];
  }
  for(const block of blocks){
    if(ends.every(end=>end<=block.start))finish();
    let column=ends.findIndex(end=>end<=block.start);
    if(column<0)column=ends.length;
    ends[column]=block.end;
    block.column=column;
    group.push(block);
  }
  finish();
  return blocks;
}

export function timelineDayCount(width){
  if(width>=760)return 7;
  if(width>=600)return 5;
  return width>=440?3:1;
}

export function clampCalendarDay(date){
  if(date.year<0)return '0000-01-01';
  if(date.year>9999)return '9999-12-31';
  return date.toString();
}

const earliestStart=()=>Temporal.PlainDate.from('0000-01-01');
const latestStart=count=>Temporal.PlainDate.from('9999-12-31').subtract({days:count-1});

function fitStart(date,count){
  const earliest=earliestStart(),latest=latestStart(count);
  if(Temporal.PlainDate.compare(date,earliest)<0)return earliest;
  if(Temporal.PlainDate.compare(date,latest)>0)return latest;
  return date;
}

export function timelinePage(day,count,timelineStart){
  const selected=Temporal.PlainDate.from(day);
  const offset=count===7?selected.dayOfWeek-1:count===5?1:0;
  let first=selected.subtract({days:offset});
  if(typeof timelineStart==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(timelineStart)){
    try{
      const saved=Temporal.PlainDate.from(timelineStart);
      const index=saved.until(selected).days;
      if(index>=0&&index<count)first=saved;
    }catch{/* The default alignment also handles invalid saved dates. */}
  }
  const start=fitStart(first,count);
  const dates=Array.from({length:count},(_,i)=>start.add({days:i}).toString());
  const page={day,dates,count};
  return {...page,previous:stepTimelineDay(page,-count)?.day??null,next:stepTimelineDay(page,count)?.day??null};
}

// Explicit starts keep seven-column windows aligned after a one-day swipe.
export function stepTimelineDay(page,delta){
  const start=Temporal.PlainDate.from(page.dates[0]);
  const next=fitStart(start.add({days:delta}),page.count);
  const shift=start.until(next).days;
  if(!shift)return null;
  return {day:Temporal.PlainDate.from(page.day).add({days:shift}).toString(),timelineStart:next.toString()};
}

export function timelinePanBounds(page){
  const start=Temporal.PlainDate.from(page.dates[0]);
  return [latestStart(page.count).until(start).days,start.since(earliestStart()).days];
}

export function moveTimelinePan(x,delta,width,left,right){
  const edge=delta<0?left:right;
  const next=x+delta;
  if(delta<0?next>=edge:next<=edge)return next;
  // Only the ends of the calendar resist movement, not the boundaries between dates.
  const start=delta<0?Math.min(x,edge):Math.max(x,edge);
  return edge+resistPan(start-edge,next-start,width*.24);
}

export function timelineQuery(page,count){
  // Prefetch adjacent days and allow two extra dates for creation-zone differences.
  return [clampCalendarDay(Temporal.PlainDate.from(page.dates[0]).subtract({days:count+2})),
    clampCalendarDay(Temporal.PlainDate.from(page.dates.at(-1)).add({days:count+2}))];
}

export function resistPan(x,delta,width){
  const band=width*.25,limit=width-band;
  const direction=Math.sign(delta),next=x+delta;
  if(direction===Math.sign(x)&&Math.abs(x)>=limit){
    return direction*(width-(width-Math.abs(x))*Math.exp(-Math.abs(delta)/band));
  }
  if(Math.abs(next)>limit&&Math.sign(next)===direction){
    return direction*(width-band*Math.exp(-(Math.abs(next)-limit)/band));
  }
  return next;
}

export function settlingPage(x,velocity,width){
  const projected=x+Math.max(-width/3,Math.min(width/3,velocity*85));
  return Math.abs(x)>Math.min(9,width*.08)&&Math.abs(projected)>width*.35?Math.sign(projected):0;
}
