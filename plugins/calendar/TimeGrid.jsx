import React,{useLayoutEffect,useMemo,useRef} from 'react';
import {localTimelineRows,positionEvents,timelinePage,stepTimelineDay} from './src/time-grid.mjs';
import useTimelinePan from './useTimelinePan.jsx';
import './time-grid.css';

const hourHeight=62;
const title=row=>row.title+(row.timing?' · '+row.timing.time+'–'+row.timing.endTime+' '+(row.timing.timeZone??''):' · 全天');
const source=row=>row.source??row;

function pageData(page,localRows){
  return {...page,blocks:page.dates.map(date=>positionEvents(localRows,date)),
    allDay:page.dates.map(date=>localRows.filter(row=>!row.timing&&row.day===date))};
}

export default function TimeGrid({day,calendarId,rows,onDay,onEvent,onEventMenu,disabled,panDisabled=disabled,count,onCount,timelineStart,
  today=Temporal.Now.plainDateISO().toString(),zone=Intl.DateTimeFormat().resolvedOptions().timeZone,onPage,preserveScroll}){
  const root=useRef(null),scroll=useRef(null);
  const page=useMemo(()=>timelinePage(day,count,timelineStart),[day,count,timelineStart]);
  const scene=JSON.stringify([day,calendarId,count,timelineStart]);
  const preview=useTimelinePan(root,{scene,page,disabled:panDisabled,onPage,onCount});
  const pages=useMemo(()=>{
    const shifted=preview?stepTimelineDay(page,preview):null;
    const visible=shifted?timelinePage(shifted.day,count,shifted.timelineStart):page;
    const current={...visible,side:''};
    const previous=preview!==null?stepTimelineDay(visible,-1):null;
    const next=preview!==null?stepTimelineDay(visible,1):null;
    const adjacent=(step,side)=>{
      const target=timelinePage(step.day,count,step.timelineStart);
      const date=side==='previous'?target.dates[0]:target.dates.at(-1);
      return {day:step.day,dates:[date],side};
    };
    const displayed=[
      ...(previous?[adjacent(previous,'previous')]:[]),
      current,
      ...(next?[adjacent(next,'next')]:[])
    ];
    const localRows=localTimelineRows(rows??[],displayed.flatMap(item=>item.dates),zone);
    return displayed.map(item=>pageData(item,localRows));
  },[page,count,rows,zone,preview]);
  const currentPage=pages.find(item=>!item.side);
  const {dates,blocks}=currentPage;
  const shortEvents=[...new Map(blocks.flat().filter(({start,end})=>(end-start)*hourHeight/60<18)
    .map(event=>[event.row,event])).values()];
  const positioned=useRef(null);
  const period=JSON.stringify([day,calendarId]);
  const firstMinute=blocks.reduce((first,events)=>Math.min(first,events[0]?.start??Infinity),Infinity);
  useLayoutEffect(()=>{
    if(!rows||positioned.current===period)return;
    if(positioned.current&&preserveScroll?.current===day){
      preserveScroll.current=null;
    }else{
      const start=Math.min(8*60,firstMinute);
      scroll.current.scrollTop=Math.max(0,Math.floor(start/60)*hourHeight-6);
    }
    positioned.current=period;
  },[rows,period,day,firstMinute,preserveScroll]);
  const eventMenu=onEventMenu?row=>event=>onEventMenu(event,source(row)):()=>undefined;
  function track(render){
    return <div className="cal-page-viewport"><div className="cal-page-track">{pages.map(item=>
      <div key={item.side} className="cal-page" data-side={item.side||undefined} inert={!!item.side}
        aria-hidden={item.side?true:undefined} style={{'--days':item.dates.length}}>
        {render(item)}
      </div>
    )}</div></div>;
  }

  return <section ref={root} className="cal-timegrid" style={{'--hour':hourHeight+'px','--columns':dates.length}} aria-label="日程时间表">
    <div className="cal-grid-head"><small className="cal-zone" title={zone} aria-label={'时间轴时区 '+zone}/>{track(item=>item.dates.map(date=>{
      const d=Temporal.PlainDate.from(date);
      return <button key={date} data-date={date} aria-label={date} aria-current={date===today?'date':undefined}
        disabled={disabled} aria-pressed={date===item.day} onClick={()=>onDay(date)}><small>周{'一二三四五六日'[d.dayOfWeek-1]}</small><b>{d.day}</b></button>;
    }))}</div>
    <div className="cal-allday"><small>全天</small>{track(item=>item.dates.map((date,i)=><div key={date} data-date={date} data-today={date===today||undefined}>
      {item.allDay[i].map(row=><button key={row.id+String(row.originalDay)} disabled={disabled}
        title={title(row)} onContextMenu={eventMenu(row)} onClick={()=>onEvent(row)}>{row.title}</button>)}
    </div>))}</div>
    <div className="cal-hours-scroll" ref={scroll} tabIndex={0} aria-label="24 小时时间轴"><div className="cal-hours">
      <div className="cal-ticks">{Array.from({length:24},(_,h)=><small key={h}><span>{String(h).padStart(2,'0')}:00</span></small>)}</div>
      {track(item=>item.blocks.map((events,i)=><div className="cal-day-track" key={item.dates[i]}
        data-date={item.dates[i]} data-today={item.dates[i]===today||undefined}>
        {events.map(({row,start,end,column,columns})=><button key={JSON.stringify([row.id,row.originalDay,start,end])} data-compact={(end-start)/60*hourHeight-2<18||undefined} title={title(row)} aria-label={title(row)} disabled={disabled}
          style={{top:start/60*hourHeight+'px',height:Math.max(1,(end-start)/60*hourHeight-2)+'px',
            left:'calc('+column/columns*100+'% + 2px)',width:'calc('+100/columns+'% - 5px)'}}
          onContextMenu={eventMenu(row)} onClick={()=>onEvent(source(row))}><strong>{row.title}</strong><small>{row.timing.time}–{row.timing.endTime}</small></button>)}
      </div>))}
    </div></div>
    {shortEvents.length>0&&<details className="cal-short-events" open>
      <summary>短时日程（{shortEvents.length}）</summary>
      {shortEvents.map(({row})=><button type="button" key={[row.id,row.day,row.originalDay].join('/')} disabled={disabled}
        title={title(row)} onContextMenu={eventMenu(row)} onClick={()=>onEvent(source(row))}>
        <time>{dates.length>1&&row.day.slice(5)+' '}{row.day===row.timing.start?row.timing.time:'00:00'}</time><span>{row.title}</span>
      </button>)}
    </details>}
  </section>;
}
