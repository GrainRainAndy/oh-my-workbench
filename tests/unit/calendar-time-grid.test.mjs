import test from 'node:test';
import assert from 'node:assert/strict';
import {localTimelineRows,positionEvents} from '../../plugins/calendar/src/time-grid.mjs';
const day='2031-05-05';
function timed(id,time,endTime,start=day,end=day){return {id,day,timing:{start,end,time,endTime}};}
test('overlapping blocks share width only within their connected interval',()=>{
  const blocks=positionEvents([timed('a','09:00','10:00'),timed('b','09:30','10:30'),timed('c','10:00','11:00'),timed('d','11:00','12:00')],day);
  assert.deepEqual(blocks.map(b=>[b.column,b.columns]),[[0,2],[1,2],[0,2],[0,1]]);
});
test('overnight segments stop at the day boundary and all-day items stay out of hourly lanes',()=>{
  const blocks=positionEvents([{id:'all',day},timed('a','23:00','01:00','2031-05-04'),timed('b','23:30','07:00',day,'2031-05-06')],day);
  assert.deepEqual(blocks.map(b=>[b.start,b.end]),[[0,60],[1410,1440]]);
});

test('remote-zone occurrences are drawn once per local day and retain the source for editing',()=>{
  const row={id:'review',day:'2031-05-06',timing:{startInstant:'2031-05-05T15:30Z',endInstant:'2031-05-05T17:00Z'}};
  const rows=localTimelineRows([row,{...row,day:'2031-05-07'}],[day,'2031-05-06'],'Asia/Shanghai');
  assert.deepEqual(rows.map(r=>r.day),[day,'2031-05-06']);
  assert.deepEqual(positionEvents(rows,day).map(b=>[b.start,b.end]),[[1410,1440]]);
  assert.deepEqual(positionEvents(rows,'2031-05-06').map(b=>[b.start,b.end]),[[0,60]]);
  assert.equal(rows[0].source,row);
  assert.equal(localTimelineRows([{...row,timing:{...row.timing,endInstant:'2031-05-05T16:00Z'}}],['2031-05-06'],'Asia/Shanghai').length,0);
});

test('opening an overnight continuation uses its matching agenda date in either input order',()=>{
  const next='2031-05-06';
  const first={id:'handoff',day,timing:{startInstant:'2031-05-05T15:30Z',endInstant:'2031-05-05T17:00Z'}};
  const continuation={...first,day:next};
  for(const rows of [[first,continuation],[continuation,first]]){
    const displayed=localTimelineRows(rows,[day,next],'Asia/Shanghai');
    assert.deepEqual(displayed.map(segment=>segment.source.day),[day,next]);
  }
});

test('time grid width boundaries share a date range and five-day page stride',async()=>{
  const {timelineDayCount,timelinePage,timelineQuery}=await import('../../plugins/calendar/src/time-grid.mjs');
  assert.deepEqual([439,440,599,600,759,760].map(timelineDayCount),[1,3,3,5,5,7]);
  const page=timelinePage('2026-11-29',5);
  assert.deepEqual(page.dates,['2026-11-28','2026-11-29','2026-11-30','2026-12-01','2026-12-02']);
  assert.equal(page.next,'2026-12-04');
  assert.deepEqual(timelineQuery(page,5),['2026-11-21','2026-12-09']);
  assert.deepEqual(timelinePage('2026-12-31',5).dates,['2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
  assert.equal(timelinePage('2026-11-29',7).dates[0],'2026-11-23');
  assert.equal(timelinePage('9999-12-31',5).next,null);
  assert.equal(timelinePage('9999-12-29',7).next,null);
  assert.equal(timelinePage('0000-01-01',7).dates[0],'0000-01-01');
});

test('pan resistance increases at the edge and a reversal moves immediately',async()=>{
  const {resistPan,settlingPage}=await import('../../plugins/calendar/src/time-grid.mjs');
  assert.equal(resistPan(0,200,400),200);
  const first=resistPan(300,50,400);
  const second=resistPan(first,50,400);
  assert.ok(second-first<first-300&&second<400);
  assert.equal(resistPan(second,-32,400),second-32);
  assert.equal(settlingPage(4,3,400),0);
  assert.equal(settlingPage(-60,-1,400),-1);
  assert.equal(settlingPage(160,0,400),1);
});

test('horizontal motion crosses day boundaries freely and resists only at the calendar limits',async()=>{
  const {moveTimelinePan,timelinePage,timelinePanBounds}=await import('../../plugins/calendar/src/time-grid.mjs');
  const width=100,left=-200,right=300;
  assert.equal(moveTimelinePan(90,140,width,left,right),230);
  assert.equal(moveTimelinePan(230,-380,width,left,right),-150);
  const beyond=moveTimelinePan(-150,-100,width,left,right);
  assert.ok(beyond>left-width*.24&&beyond<left);
  assert.equal(moveTimelinePan(beyond,8,width,left,right),beyond+8);
  assert.equal(timelinePanBounds(timelinePage('9999-12-31',7))[0],0);
  assert.equal(timelinePanBounds(timelinePage('0000-01-01',5))[1],0);
});

test('a timed event crossing the repeated hour uses both local wall-clock intervals',()=>{
  const day='2026-11-01';
  const row={id:'fold',day,timing:{startInstant:'2026-11-01T05:45Z',endInstant:'2026-11-01T06:15Z'}};
  const displayed=localTimelineRows([row],[day],'America/New_York');
  const blocks=positionEvents(displayed,day);
  assert.deepEqual(blocks.map(({start,end})=>[start,end]),[[60,75],[105,120]]);
  assert.ok(blocks.every(({row:fragment})=>fragment.source===row));
  const overlap={...row,timing:{startInstant:'2026-11-01T05:15Z',endInstant:'2026-11-01T06:45Z'}};
  const repeated=positionEvents(localTimelineRows([overlap],[day],'America/New_York'),day);
  assert.deepEqual(repeated.map(({start,end,column,columns})=>[start,end,column,columns]),[[60,105,0,2],[75,120,1,2]]);
});

test('a daily swipe advances the visible window one column across weeks and years',async()=>{
  const {timelinePage,stepTimelineDay}=await import('../../plugins/calendar/src/time-grid.mjs');
  for(const count of [1,3,5,7]){
    const original=timelinePage('2026-12-31',count);
    const dates=original.dates;
    const next=stepTimelineDay(original,1);
    assert.equal(next.day,'2027-01-01');
    assert.deepEqual(timelinePage(next.day,count,next.timelineStart).dates.slice(0,-1),dates.slice(1));
    const previous=stepTimelineDay(original,-1);
    assert.equal(previous.day,'2026-12-30');
    assert.deepEqual(timelinePage(previous.day,count,previous.timelineStart).dates.slice(1),dates.slice(0,-1));
  }
  assert.equal(stepTimelineDay(timelinePage('9999-12-31',5),1),null);
});
