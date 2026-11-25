import React,{useEffect,useRef,useState} from 'react';
import './view.css';
import {AddButton,ActionMenu,menuPosition,ViewIcon,RecordDialog} from '../../packages/ui-kit/src/index.jsx';
import TimeGrid from './TimeGrid.jsx';
import {clampCalendarDay,stepTimelineDay,timelinePage,timelineQuery} from './src/time-grid.mjs';

const service='workbench.calendar.events',version='1.0.0';
const rowIdentity=row=>JSON.stringify([row.id,row.originalDay,row.day]);
function describeRule({frequency,interval=1,count,until}){
  const units={daily:'天',weekly:'周',monthly:'个月',yearly:'年'};
  const labels={daily:'每天',weekly:'每周',monthly:'每月',yearly:'每年'};
  const cadence=interval===1?labels[frequency]:`每 ${interval} ${units[frequency]}`;
  if(count)return `${cadence} · 共 ${count} 次`;
  if(until)return `${cadence} · 至 ${until}`;
  return cadence;
}
function EventRow({initialEdit,drafts,row,day,services,onEditSeries,canEditSeries,calendarId,calendars,detached,resolveDetached,close}){
  const [edit,setEdit]=useState(initialEdit??null),[pending,setPending]=useState(false),[error,setError]=useState('');
  const [menu,setMenu]=useState(null),[showReminder,setShowReminder]=useState(false);
  const draftKey=useRef(Symbol());
  React.useLayoutEffect(()=>{
    const key=draftKey.current;
    if(edit&&edit!==initialEdit||pending)drafts.current.set(key,{row,pending,discard:()=>setEdit(null)});
    else if(detached&&!edit)resolveDetached();
    return ()=>drafts.current.delete(key);
  },[drafts,edit,initialEdit,pending,row,detached,resolveDetached]);
  function dismiss(){setEdit(null);setError('');close?.();}
  const destinations=calendars.filter(calendar=>calendar.id!==calendarId);
  function openMenu(e){
    if(pending||e.target.closest('input,select,textarea'))return;
    setMenu(menuPosition(e));
  }
  function actionButton(actions){
    if(destinations.length)actions.push([row.rule?'移动整组到日历':'移动到日历',()=>setEdit({targetCalendar:destinations[0].id,sourceCalendar:calendarId})]);
    return <><button className="calendar-actions-toggle" aria-haspopup="menu" aria-label={row.title+'的操作'} disabled={pending} onClick={openMenu}>···</button>
      {menu&&<ActionMenu label={row.title} position={menu} actions={actions} close={()=>setMenu(null)}/>}</>;
  }
  if(edit?.targetCalendar)return <li><form onSubmit={async event=>{
    event.preventDefault();
    if(detached||pending)return;
    setPending(true);
    try{
      await services.call(service,version,'moveToCalendar',[row.id,edit.sourceCalendar,edit.targetCalendar]);
      dismiss();
    }catch{setError('移动未确认，请核对日历归属后重试。');}
    finally{setPending(false);}
  }}>
    <strong>{row.title}</strong>
    <label>{row.rule?'整组移至':'移至'}<select aria-label="目标日历" disabled={pending} value={edit.targetCalendar} onChange={e=>setEdit({...edit,targetCalendar:e.target.value})}>
      {destinations.map(calendar=><option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}
    </select></label>
    <button className="plugin" disabled={pending||detached}>确认移动</button><button type="button" disabled={pending} onClick={dismiss}>取消</button>
  </form>{error&&<p role="alert">{error}</p>}</li>;
  async function remove(){
    if(detached||pending)return;
    setPending(true);
    try{
      if(edit.timing)await services.call(service,version,'deleteTimed',[row.id,edit.start,edit.original,edit.timing]);
      else if(edit.originalDay)await services.call(service,version,'cancelOccurrence',[row.id,edit.start,edit.original,edit.rule,edit.originalDay]);
      else if(edit.rule)await services.call(service,version,'deleteSeries',[row.id,edit.start,edit.original,edit.rule]);
      else await services.call(service,version,'deleteAllDay',[row.id,day,edit.original]);
      dismiss();
    }catch{setError('删除未确认。请取消编辑，核对日程后重试。');}
    finally{setPending(false);}
  }
  async function saveChanges(event){
    event.preventDefault();
    if(detached||pending)return;
    setPending(true);
    try{
      if(edit.expectedTiming){
        await services.call(service,version,'updateTimed',[row.id,edit.start,edit.title,edit.time,edit.end,edit.endTime,edit.timeZone,edit.original,edit.expectedTiming]);
      }else await services.call(service,version,'updateAllDay',[row.id,day,edit.title,edit.original,edit.day]);
      dismiss();
    }catch{setError('更改未保存。请取消编辑，核对日程后重试。');}
    finally{setPending(false);}
  }
  if(edit?.expectedTiming)return <li><form onSubmit={saveChanges}>
    <label>名称<input aria-label="修改日程名称" required maxLength={160} autoFocus disabled={pending} value={edit.title} onChange={e=>setEdit({...edit,title:e.target.value})}/></label>
    <fieldset className="calendar-rule" disabled={pending}>
      <legend>时间 · {edit.timeZone}</legend>
      {Object.entries({start:'开始日期',time:'开始时间',end:'结束日期',endTime:'结束时间'}).map(([key,label])=>
        <label key={key}>{label}<input required type={key==='start'||key==='end'?'date':'time'} min={key==='end'?edit.start:undefined} value={edit[key]} onChange={e=>setEdit({...edit,[key]:e.target.value})}/></label>)}
    </fieldset>
    <button className="plugin" disabled={pending||detached||!edit.title.trim()}>保存修改</button>
    <button type="button" disabled={pending} onClick={dismiss}>取消</button>
  </form>{error&&<p role="alert">{error}</p>}</li>;
  const reminderControl=row.timing&&<label>{row.rule?'整组提醒':'提醒'}<select aria-label={row.rule?'整组提醒':'事件提醒'} disabled={pending} value={row.reminderMinutes??'off'} onChange={async event=>{
        const next=event.target.value;
        setPending(true);
        try{await services.call(service,version,'configureReminder',[row.id,String(row.reminderMinutes??'off'),next]);setError('');}
        catch{setError('提醒设置未保存，请核对后重试。');}
        finally{setPending(false);}
      }}>
        <option value="off">关闭</option><option value="0">开始时</option>
        {[5,10,30,60].map(minutes=><option key={minutes} value={minutes}>提前 {minutes} 分钟</option>)}
      </select></label>;
  if(row.timing&&!row.rule&&!edit?.deleting){
    const {start,time,end,endTime,timeZone}=row.timing;
    return <li onContextMenu={openMenu}><strong>{row.title}</strong><div>{start} {time} – {start!==end&&end+' '}{endTime}</div><small>{timeZone}</small>
      {actionButton([['编辑',()=>setEdit({...row.timing,title:row.title,original:row.title,expectedTiming:JSON.stringify(row.timing)})],
        ['设置提醒',()=>setShowReminder(true)],['删除',()=>setEdit({deleting:true,original:row.title,start,timing:JSON.stringify(row.timing)})]])}
      {showReminder&&reminderControl}{error&&<p role="alert">{error}</p>}</li>;
  }
  const occurrenceStart=row.timing?.date??day;
  if(edit?.moving)return <li><form onSubmit={async event=>{
    event.preventDefault();if(detached||pending)return;setPending(true);
    try{
      await services.call(service,version,'moveOccurrence',[row.id,edit.start,edit.title,edit.rule,edit.originalDay,edit.target]);
      dismiss();
    }catch{setError('改期未确认，请取消后核对日程。');}
    finally{setPending(false);}
  }}>
    <label>本次改至<input type="date" required disabled={pending} value={edit.target} onChange={e=>setEdit({...edit,target:e.target.value})}/></label>
    <button className="plugin" disabled={pending||detached||edit.target===occurrenceStart}>保存改期</button>
    <button type="button" disabled={pending} onClick={dismiss}>取消</button>
  </form>{error&&<p role="alert">{error}</p>}</li>;
  if(row.rule&&!edit?.deleting){
    const snapshot={original:row.title,start:row.start,rule:JSON.stringify(row.rule)};
    const actions=canEditSeries?[
      ['仅本次改期',()=>setEdit({...snapshot,moving:true,target:occurrenceStart,originalDay:row.originalDay,title:row.title})],
      ['仅取消本次',()=>setEdit({...snapshot,deleting:true,originalDay:row.originalDay})],
      ['编辑整组',()=>onEditSeries(row)],['删除整组',()=>setEdit({...snapshot,deleting:true})]
    ]:[];
    if(row.timing)actions.push(['设置提醒',()=>setShowReminder(true)]);
    return <li onContextMenu={openMenu} className="calendar-event-row calendar-series">
      <span>{row.title}</span>{(actions.length>0||destinations.length>0)&&actionButton(actions)}
      <small>{row.timing&&(row.timing.start===row.timing.end?'':row.timing.start+' ')+row.timing.time+' – '+(row.timing.start===row.timing.end?'':row.timing.end+' ')+row.timing.endTime+' · '}{describeRule(row.rule)}{row.originalDay!==occurrenceStart&&' · 原定 '+row.originalDay}</small>
      {showReminder&&reminderControl}
    </li>;
  }
  return <li>{edit?.deleting?<div className="calendar-delete">
    <strong>{edit.originalDay?'取消':'删除'}「{edit.original}」{edit.originalDay?'于 '+occurrenceStart+' 开始的日程':edit.rule&&"的全部重复日程"}？</strong>
    <button type="button" disabled={pending||detached} onClick={remove}>{edit.originalDay?"确认取消本次":edit.rule?"确认删除整组":"确认删除"}</button>
    <button type="button" disabled={pending} onClick={dismiss}>取消</button>
  </div>:edit?<form onSubmit={saveChanges}>
    <input aria-label="修改日程名称" autoFocus disabled={pending} maxLength={160} value={edit.title} onChange={e=>setEdit({...edit,title:e.target.value})}/>
    <label>日程日期<input type="date" required disabled={pending} value={edit.day} onChange={e=>setEdit({...edit,day:e.target.value})}/></label>
    <button className="plugin" disabled={pending||detached||!edit.day||!edit.title.trim()}>保存</button>
    <button type="button" disabled={pending} onClick={dismiss}>取消</button>
  </form>:<div className="calendar-event-row" onContextMenu={openMenu}><span>{row.title}</span>{actionButton([
    ['编辑',()=>setEdit({original:row.title,title:row.title,day})],['删除',()=>setEdit({original:row.title,deleting:true})]
  ])}</div>}
  {error&&<p role="alert">{error}</p>}</li>;
}
function WeekNavigator({day,disabled,selectDay,counts}){
  const selected=Temporal.PlainDate.from(day);
  const monday=selected.subtract({days:selected.dayOfWeek-1});
  return <div role="group" className="calendar-week" aria-label="按周选择日期">
    <button type="button" aria-label="上一周" disabled={disabled||selected.year===0&&selected.dayOfYear<=7} onClick={()=>selectDay(selected.subtract({weeks:1}).toString())}>‹</button>
    {Array.from('一二三四五六日',(weekday,index)=>{
      const date=monday.add({days:index}),value=date.toString();
      return <button key={value} type="button" aria-label={value} title={value+" · "+(counts.get(value)??0)+" 项日程"} data-has-events={counts.has(value)} aria-pressed={value===day} disabled={disabled||date.year<0||date.year>9999} onClick={()=>selectDay(value)}>
        <small>{weekday}</small><strong>{date.day}</strong>
      </button>;
    })}
    <button type="button" aria-label="下一周" disabled={disabled||selected.year===9999&&selected.dayOfYear>selected.daysInYear-7} onClick={()=>selectDay(selected.add({weeks:1}).toString())}>›</button>
  </div>;
}
function MonthNavigator({selected,counts,disabled,selectDay}){
  const start=selected.with({day:1});
  return <section className="calendar-month" aria-label="月历">
    <div className="calendar-month-heading">
      <button aria-label="上一月" disabled={disabled||selected.year===0&&selected.month===1} onClick={()=>selectDay(selected.subtract({months:1}).toString())}>‹</button>
      <strong>{selected.year} 年 {selected.month} 月</strong>
      <button aria-label="下一月" disabled={disabled||selected.year===9999&&selected.month===12} onClick={()=>selectDay(selected.add({months:1}).toString())}>›</button>
    </div>
    <div className="calendar-month-grid">
      {Array.from('一二三四五六日',weekday=><small key={weekday}>{weekday}</small>)}
      {Array.from({length:selected.daysInMonth},(_,index)=>{
        const date=start.add({days:index}),value=date.toString(),count=counts.get(value)??0;
        return <button key={value} disabled={disabled} aria-label={value+'，'+count+' 项日程'} aria-pressed={selected.equals(date)}
          style={index===0?{gridColumnStart:start.dayOfWeek}:undefined} title={count+' 项日程'} data-has-events={count>0}
          onClick={()=>selectDay(value)}>{date.day}</button>;
      })}
    </div>
  </section>;
}
function localClock(){
  const now=Temporal.Now.zonedDateTimeISO();
  return {today:now.toPlainDate().toString(),zone:now.timeZoneId,
    untilMidnight:now.add({days:1}).startOfDay().epochMilliseconds-now.epochMilliseconds};
}
function useLocalCalendar(){
  const [clock,setClock]=useState(localClock);
  useEffect(()=>{
    let timer;
    function sync(){
      clearTimeout(timer);
      const next=localClock();
      setClock(old=>old.today===next.today&&old.zone===next.zone?old:next);
      if(!document.hidden)timer=setTimeout(sync,Math.min(next.untilMidnight+50,300000));
    }
    sync();
    window.addEventListener('focus',sync);
    document.addEventListener('visibilitychange',sync);
    return ()=>{clearTimeout(timer);window.removeEventListener('focus',sync);document.removeEventListener('visibilitychange',sync);};
  },[]);
  return clock;
}

function CalendarComposer({saving,series,anchor,onCancel,children}){
  const dialog=useRef(null);
  React.useLayoutEffect(()=>{
    const element=dialog.current;
    element.showModal();
    function position(){
      if(!anchor?.isConnected)return;
      const bounds=anchor.getBoundingClientRect();
      const margin=12;
      const left=Math.max(margin,Math.min(bounds.right-element.offsetWidth,innerWidth-element.offsetWidth-margin));
      const top=Math.max(margin,Math.min(bounds.bottom+8,innerHeight-element.offsetHeight-margin));
      element.style.left=left+'px';
      element.style.top=top+'px';
    }
    position();
    const observer=new ResizeObserver(position);
    observer.observe(element);
    window.addEventListener('resize',position);
    element.querySelector('[aria-label="日程名称"]')?.focus({preventScroll:true});
    return ()=>{
      observer.disconnect();
      window.removeEventListener('resize',position);
      element.close();
      if(anchor?.isConnected)anchor.focus({preventScroll:true});
    };
  },[anchor]);
  const label=series?'编辑重复日程':'新建日程';
  return <dialog ref={dialog} className="calendar-compose" data-anchored={Boolean(anchor)||undefined} aria-label={label} aria-busy={saving}
    onCancel={event=>{event.preventDefault();if(!saving)onCancel();}}>
    <header className="calendar-compose-heading">
      <span className="calendar-compose-icon"><ViewIcon kind="calendar"/></span><h2>{label}</h2>
      <button className="calendar-compose-close" type="button" aria-label="关闭" disabled={saving} onClick={onCancel}><ViewIcon kind="close"/></button>
    </header>
    {children}
  </dialog>;
}

export default function Agenda({services,state,updateState,registerController,navigateView}){
  const {today,zone}=useLocalCalendar();
  const [initialDay]=useState(today);
  const [panTarget,setPanTarget]=useState(null);
  const panWrite=useRef(null);
  let day=initialDay;
  if(typeof state.day==='string' && /^\d{4}-\d{2}-\d{2}$/.test(state.day)){
    try{day=Temporal.PlainDate.from(state.day).toString();}catch{/* Keep today for an invalid saved date. */}
  }
  if(panTarget)day=panTarget.day;
  const calendarId=state.calendarId??'default';
  const [calendars,setCalendars]=useState([]);
  const [newCalendar,setNewCalendar]=useState(null);
  const calendarRequest=useRef(null);
  const changing=useRef(false),preserveScroll=useRef(null);
  function navigateTo(patch,errorMessage,{keepScroll}={}){
    if(changing.current)return false;
    let started=false;
    navigateView(async()=>{
      started=true;changing.current=true;
      if(keepScroll)preserveScroll.current=patch.day;
      setChangingDay(true);
      try{
        await updateState({...state,...patch});
        setError('');
      }catch{
        preserveScroll.current=null;setError(errorMessage);
      }finally{changing.current=false;setChangingDay(false);}
    });
    return started;
  }
  function selectCalendar(id){
    if(id!==calendarId)navigateTo({calendarId:id},'切换日历未保存，请重试。');
  }
  async function createCalendar(){
    const name=newCalendar.trim();
    if(!name||saving)return;
    if(calendarRequest.current?.name!==name)calendarRequest.current={name,id:crypto.randomUUID()};
    setSaving(true);
    try{
      const id=await services.call(service,version,'createCalendar',[calendarRequest.current.id,name]);
      await updateState({...state,calendarId:id});
      setNewCalendar(null);calendarRequest.current=null;setError('');
    }catch{setError('新建或切换日历未确认，请重试。');}
    finally{setSaving(false);}
  }
  const [changingDay,setChangingDay]=useState(false);
  const timeline=!state.calendarMode||state.calendarMode==='timeline';
  const [visibleDays,setVisibleDays]=useState(1);
  const weekOverview=state.calendarMode==='weekOverview';
  const monthMode=state.calendarMode==='month';
  function selectDay(next,mode=state.calendarMode,options){
    if(!next||(next===day&&(!options?.resetWindow||!state.timelineStart)&&(mode??'timeline')===(state.calendarMode??'timeline')))return false;
    return navigateTo({day:next,calendarMode:mode??'timeline',timelineStart:null,timelineCount:null},'查看日期未保存，请重试。',options);
  }
  const selected=Temporal.PlainDate.from(day);
  const monday=selected.subtract({days:selected.dayOfWeek-1});
  const sunday=monday.add({days:6});
  const timelineState=panTarget??state;
  const timelineStart=timelineState.timelineCount===visibleDays?timelineState.timelineStart:undefined;
  const page=timeline?timelinePage(day,visibleDays,timelineStart):null;
  const headingDay=Temporal.PlainDate.from(today);
  const [first,last]=page?timelineQuery(page,visibleDays):monthMode?
    [selected.with({day:1}).toString(),selected.with({day:selected.daysInMonth}).toString()]:
    [clampCalendarDay(monday),clampCalendarDay(sunday)];
  function pageTo(next){
    if(!next)return false;
    return navigateTo({...next,calendarMode:'timeline',timelineCount:visibleDays},'查看日期未保存，请重试。',{keepScroll:true});
  }
  function panPageTo(next,onFailure){
    const target={...next,calendarMode:'timeline',timelineCount:visibleDays};
    function preview(){
      preserveScroll.current=target.day;
      setPanTarget(target);
    }
    if(panWrite.current){
      panWrite.current.target=target;
      panWrite.current.onFailure=onFailure;
      preview();
      return true;
    }
    if(changing.current)return false;
    let started=false;
    navigateView(async()=>{
      started=true;changing.current=true;
      const writer={target,onFailure};
      panWrite.current=writer;
      setChangingDay(true);
      preview();
      let confirmedDay=day;
      try{
        // Navigation stays responsive while we serialize writes and coalesce queued dates.
        let pending;
        do{
          pending=writer.target;
          await updateState({...state,...pending});
          confirmedDay=pending.day;
        }while(pending.day!==writer.target.day||pending.timelineStart!==writer.target.timelineStart||
          pending.timelineCount!==writer.target.timelineCount);
        setError('');
      }catch{
        preserveScroll.current=confirmedDay;
        setError('查看日期未保存，请重试。');
        writer.onFailure?.();
      }finally{
        panWrite.current=null;
        setPanTarget(null);
        changing.current=false;setChangingDay(false);
      }
    });
    return started;
  }
  const [rangeResult,setRangeResult]=useState(null),[title,setTitle]=useState('');
  const viewport=page?.dates;
  const rangeRows=rangeResult?.calendarId===calendarId&&(
    rangeResult.first===first&&rangeResult.last===last||
    viewport&&rangeResult.first<=clampCalendarDay(Temporal.PlainDate.from(viewport[0]).subtract({days:2}))&&
       rangeResult.last>=clampCalendarDay(Temporal.PlainDate.from(viewport.at(-1)).add({days:2}))
  )?rangeResult.rows:null;
  const rows=rangeRows?.filter(row=>row.day===day);
  const counts=new Map();
  for(const row of rangeRows??[])counts.set(row.day,(counts.get(row.day)??0)+1);
  const [error,setError]=useState(''),[saving,setSaving]=useState(false);
  const api=useRef(services),request=useRef(null);
  const retryRead=useRef(null);
  const [readStatus,setReadStatus]=useState('ready');
  api.current=services;
  const rangeKey=JSON.stringify([first,last,calendarId]);
  const currentRange=useRef(rangeKey);
  currentRange.current=rangeKey;
  useEffect(()=>{
    let ticket=0;
    setReadStatus('ready');
    async function read(){
      const current=++ticket;
      try{
        const [values,names]=await Promise.all([api.current.call(service,version,'listRange',[first,last,calendarId]),api.current.call(service,version,'listCalendars','')]);
        if(current===ticket&&currentRange.current===rangeKey){setCalendars(names.map(value=>JSON.parse(value)));setRangeResult({first,last,calendarId,rows:values.map(value=>JSON.parse(value))});setReadStatus('ready');}
      }catch{if(current===ticket&&currentRange.current===rangeKey)setReadStatus('failed');}
    }

    retryRead.current=read;
    const stop=api.current.watch(service,version,read);
    read();
    return ()=>{ticket++;retryRead.current=null;stop();};
  },[first,last,calendarId]);
  const [frequency,setFrequency]=useState('');
  const [timed,setTimed]=useState(false);
  const [fromTime,setFromTime]=useState('09:00'),[toTime,setToTime]=useState('10:00'),[untilDay,setUntilDay]=useState('');
  const [interval,setIntervalValue]=useState('1'),[ending,setEnding]=useState('never');
  const [count,setCount]=useState('2'),[until,setUntil]=useState('');
  const [series,setSeries]=useState(null),[start,setStart]=useState('');
  const [composer,setComposer]=useState(false);
  const [draftCalendar,setDraftCalendar]=useState('');
  const addTrigger=useRef(null);
  const composerDirty=!!(title||series||frequency||composer&&
    (start!==day||draftCalendar!==calendarId||!timed||fromTime!=='09:00'||toTime!=='10:00'||untilDay));
  const timeZone=series?.seriesTiming?.timeZone??zone;
  const eventStart=start;
  const titleField=useRef(null);
  const rowDrafts=useRef(new Map());
  const [,resolveDetached]=React.useReducer(value=>value+1,0);
  const retained=[...rowDrafts.current.values()].map(draft=>draft.row).filter(row=>
    !rangeRows?.some(current=>rowIdentity(current)===rowIdentity(row)));

  React.useLayoutEffect(()=>registerController({
    prepareClose(){
      if(saving||changingDay||Array.from(rowDrafts.current.values()).some(row=>row.pending))
        return {status:'blocked',message:'正在保存日程更改，请稍候。'};
      if(!composerDirty&&!newCalendar&&!rowDrafts.current.size)return {status:'ready'};
      return {status:'dirty',message:'日程窗格有尚未保存的更改。',
        canSave:!rowDrafts.current.size&&!newCalendar&&Boolean(title.trim()&&titleField.current?.form.checkValidity())};
    },
    saveDraft:()=>create(),
    discardDraft(){
      clearForm();setNewCalendar(null);request.current=null;
      for(const row of rowDrafts.current.values())row.discard();
    }
  }));
  function editSeries(row){
    addTrigger.current=null;
    setDraftCalendar(calendarId);
    if(row.seriesTiming){setTimed(true);setFromTime(row.seriesTiming.time);setToTime(row.seriesTiming.endTime);setUntilDay(row.seriesTiming.end);}
    setSeries(row);setStart(row.start);setTitle(row.title);
    setFrequency(row.rule.frequency);setIntervalValue(String(row.rule.interval));
    setEnding(row.rule.count?'count':row.rule.until?'until':'never');
    setCount(String(row.rule.count??2));setUntil(row.rule.until??'');setError('');
    setComposer(true);
  }
  function clearForm(){
    setTimed(false);setUntilDay('');setFromTime('09:00');setToTime('10:00');
    setSeries(null);setStart('');setDraftCalendar('');setTitle('');setFrequency('');setIntervalValue('1');setEnding('never');setCount('2');setUntil('');setError('');setComposer(false);
  }
  async function create(event){
    event?.preventDefault();
    if(!title.trim()||saving){if(!event)throw Error('日程尚未就绪');return;}
    const rule={frequency,interval:Number(interval)};
    if(ending==='count')rule.count=Number(count);
    if(ending==='until')rule.until=until;
    const encodedRule=frequency?JSON.stringify(rule):null;
    const timing=timed?[fromTime,untilDay||eventStart,toTime,timeZone]:null;
    if(timed&&(untilDay||eventStart)===eventStart&&toTime<=fromTime){setError('结束时间须晚于开始时间。跨午夜时请选择次日。');if(!event)throw Error('日程时间无效');return;}
    const key=JSON.stringify([draftCalendar,eventStart,title,encodedRule,timing]);
    if(request.current?.key!==key)request.current={id:crypto.randomUUID(),key};
    setSaving(true);
    try{
      const input=[series?.id??request.current.id,eventStart,title];
      if(timing)input.push(...timing);
      if(frequency)input.push(encodedRule);
      if(series)input.push(series.start,series.title,JSON.stringify(series.rule));
      if(series?.seriesTiming)input.push(JSON.stringify(series.seriesTiming));
      const operation=series&&timed?'updateTimedSeries':series?'updateSeries':timed&&frequency?'createTimedSeries':timed?'createTimed':frequency?'createSeries':'createAllDay';
      await api.current.call(service,version,series?operation:'createInCalendar',series?input:[draftCalendar,operation,...input]);
      request.current=null;clearForm();
    }catch(error){setError(series?'整组修改未确认。请取消后核对最新规则。':'保存未确认，请重试。');if(!event)throw error;}finally{setSaving(false);}
  }
  function cancelComposer(){
    if(composerDirty)navigateView(()=>{clearForm();request.current=null;});
    else clearForm();
  }
  const [gridMenu,setGridMenu]=useState(null);
  const [gridEvent,setGridEvent]=useState(null);
  function openGridEvent(row){
    const initialEdit=row.rule?null:row.timing
      ?{...row.timing,title:row.title,original:row.title,expectedTiming:JSON.stringify(row.timing)}
      :{title:row.title,original:row.title,day:row.day};
    navigateView(()=>setGridEvent({row,initialEdit}));
  }
  function renderEvent(row,options){
    return <EventRow key={rowIdentity(row)} row={row} day={row.day} drafts={rowDrafts}
      calendars={calendars} calendarId={calendarId} detached={retained.includes(row)} resolveDetached={resolveDetached}
      services={services} onEditSeries={editSeries} canEditSeries={!composer&&!saving&&!changingDay} {...options}/>;
  }
  function eventList(events){return <ul>{events.map(row=>renderEvent(row))}</ul>;}
  const currentGridEvent=gridEvent&&rangeRows?.find(row=>rowIdentity(row)===rowIdentity(gridEvent.row));
  const agendaRows=[...rangeRows??[],...retained];
  const agendaDays=[...new Set(agendaRows.map(row=>row.day))].sort();
  const dayRows=agendaRows.filter(row=>row.day===day);
  return <div className={timeline?'calendar-agenda calendar-timeline':'calendar-agenda'}>
    {readStatus!=='ready'&&<div className="plugin-read-error" role="alert"><span>日程读取失败。</span>
      <button disabled={readStatus==='retrying'} onClick={()=>{setReadStatus('retrying');retryRead.current?.();}}>{readStatus==='retrying'?'正在重试…':'重新读取'}</button></div>}
    <header className="calendar-heading"><details className="calendar-controls"><summary aria-label="日历与视图" title="日历与视图"><div className="calendar-heading-date">
      <p>{headingDay.year}年{headingDay.month}月</p><h2>{headingDay.day}日 <span>星期{'一二三四五六日'[headingDay.dayOfWeek-1]}</span></h2>
    </div><ViewIcon kind="down"/></summary>
    <div className="calendar-controls-panel">
    <div className="calendar-view-tools">
    <div className="calendar-modes" role="group" aria-label="日程视图">
      <button type="button" aria-pressed={timeline} disabled={saving||changingDay||!!series} onClick={()=>selectDay(day,'timeline')}>时间表</button>
      <button type="button" aria-pressed={!timeline&&!weekOverview&&!monthMode} disabled={saving||changingDay||!!series} onClick={()=>selectDay(day,'week')}>日列表</button>
      <button type="button" aria-pressed={weekOverview} disabled={saving||changingDay||!!series} onClick={()=>selectDay(day,'weekOverview')}>周列表</button>
      <button type="button" aria-label="月历" aria-pressed={monthMode} disabled={saving||changingDay||!!series} onClick={()=>selectDay(day,'month')}>月历</button>
    </div>
    <div className="calendar-date-tools">
      <label>日期<input type="date" value={day} disabled={saving||changingDay||!!series} onChange={e=>selectDay(e.target.value)}/></label>
    </div></div>
    <div>
    <div className="calendar-picker"><select aria-label="当前日历" value={calendarId} disabled={saving||changingDay||!!series} onChange={e=>selectCalendar(e.target.value)}>
      {calendars.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
    </select><button type="button" aria-label="新建日历" disabled={saving||changingDay||!!series} onClick={()=>navigateView(()=>setNewCalendar(''))}>新建日历</button>
    {newCalendar!==null&&<div><input aria-label="日历名称" placeholder="日历名称" autoFocus maxLength={80} disabled={saving} value={newCalendar} onChange={e=>setNewCalendar(e.target.value)}/>
      <button disabled={saving||!newCalendar.trim()} onClick={createCalendar}>创建日历</button><button disabled={saving} onClick={()=>setNewCalendar(null)}>取消</button></div>}
    </div>
    </div>
    </div></details>
    <div className="calendar-page-tools"><div className="calendar-navigation">
      {page&&<button type="button" aria-label={'向前'+visibleDays+'天'} disabled={saving||changingDay||!page.previous}
        onClick={()=>pageTo(stepTimelineDay(page,-visibleDays))}><ViewIcon kind="left"/></button>}
      <button type="button" aria-label="返回今天" disabled={saving||changingDay||!!series} onClick={()=>selectDay(Temporal.Now.plainDateISO().toString(),state.calendarMode,{resetWindow:true})}>今天</button>
      {page&&<button type="button" aria-label={'向后'+visibleDays+'天'} disabled={saving||changingDay||!page.next}
        onClick={()=>pageTo(stepTimelineDay(page,visibleDays))}><ViewIcon kind="right"/></button>}
    </div>
      <AddButton className="calendar-create" tone="calendar" label="新建日程" hasPopup="dialog" expanded={composer} disabled={saving||changingDay}
        onClick={event=>{
          const trigger=event.currentTarget;
          navigateView(()=>{
            addTrigger.current=trigger;
            setError('');setStart(day);setDraftCalendar(calendarId);setTimed(true);setComposer(true);
          });
        }}/>
    </div></header>
    {monthMode?<MonthNavigator selected={selected} counts={counts} disabled={saving||changingDay||!!series} selectDay={selectDay}/>:timeline?null:<WeekNavigator day={day} counts={counts} disabled={saving||changingDay||!!series} selectDay={selectDay}/>}
    {timeline&&<TimeGrid timelineStart={timelineStart} count={visibleDays} onCount={setVisibleDays} day={day} calendarId={calendarId} rows={rangeRows} today={today} zone={zone} onPage={panPageTo} preserveScroll={preserveScroll}
      disabled={saving||changingDay||composer||!!gridEvent} panDisabled={saving||(changingDay&&!panWrite.current)||composer||!!gridEvent} onDay={selectDay} onEvent={openGridEvent} onEventMenu={(e,row)=>{
      const actions=[['查看日程',()=>openGridEvent(row)]];
      if(!row.rule)actions.push(['编辑',()=>openGridEvent(row)]);
      setGridMenu({position:menuPosition(e),label:row.title,actions});
    }}/>}
    {gridEvent&&<RecordDialog title="日程详情" onCancel={()=>navigateView(()=>setGridEvent(null))}>
      {!currentGridEvent&&<p role="status">此日程已发生变化。关闭详情后可查看最新日程。</p>}
      <ul>{renderEvent(currentGridEvent??gridEvent.row,{initialEdit:gridEvent.initialEdit,detached:!currentGridEvent,
        close:()=>setGridEvent(null),onEditSeries:row=>{setGridEvent(null);editSeries(row);}})}</ul>
    </RecordDialog>}
    {gridMenu&&<ActionMenu {...gridMenu} close={()=>setGridMenu(null)}/>}
    {composer&&<CalendarComposer saving={saving} series={series} anchor={addTrigger.current} onCancel={cancelComposer}>
      <form onSubmit={create}>
        <input className="calendar-draft-title" ref={titleField} aria-label="日程名称" placeholder="日程名称" maxLength={160}
          required disabled={saving} value={title} onChange={event=>setTitle(event.target.value)}/>
        {!series&&<label className="calendar-compose-calendar">
          <span><ViewIcon kind="calendar"/>日历</span>
          <select aria-label="保存到日历" value={draftCalendar} disabled={saving} onChange={event=>setDraftCalendar(event.target.value)}>
            {!calendars.some(item=>item.id===draftCalendar)&&<option value={draftCalendar}>当前日历</option>}
            {calendars.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>}
        <section className="calendar-compose-section" aria-label="时间安排">
          <div className="calendar-compose-section-heading">
            <span><ViewIcon kind="clock"/>时间</span>
            {!series&&<select aria-label="日程类型" value={timed?'timed':'allDay'} disabled={saving}
              onChange={event=>setTimed(event.target.value==='timed')}>
              <option value="timed">定时</option><option value="allDay">全天</option>
            </select>}
          </div>
          <div className="calendar-compose-slot">
            <span>{timed?'开始':'日期'}</span>
            <input type="date" aria-label={series?'系列开始日期':'开始日期'} required disabled={saving}
              value={eventStart} onChange={event=>{
                setStart(event.target.value);
                if(untilDay&&untilDay<event.target.value)setUntilDay('');
              }}/>
            {timed&&<input type="time" aria-label="开始时间" required disabled={saving} value={fromTime} onChange={event=>setFromTime(event.target.value)}/>}
          </div>
          {timed&&<><div className="calendar-compose-slot">
            <span>结束</span>
            <input type="date" aria-label="结束日期" required disabled={saving} min={eventStart} value={untilDay||eventStart}
              onChange={event=>setUntilDay(event.target.value)}/>
            <input type="time" aria-label="结束时间" required disabled={saving} value={toTime} onChange={event=>setToTime(event.target.value)}/>
          </div><small className="calendar-compose-zone">{timeZone}</small></>}
        </section>
        <section className="calendar-compose-section" aria-label="重复规则">
          <label className="calendar-compose-section-heading">
            <span><ViewIcon kind="repeat"/>重复</span>
            <select aria-label="重复频率" disabled={saving} value={frequency} onChange={event=>setFrequency(event.target.value)}>
              {!series&&<option value="">不重复</option>}
              <option value="daily">每天</option><option value="weekly">每周</option>
              <option value="monthly">每月</option><option value="yearly">每年</option>
            </select>
          </label>
          {frequency&&<fieldset className="calendar-rule" disabled={saving}>
            <legend>重复设置</legend>
            <label>间隔<input type="number" min="1" step="1" required value={interval} onChange={event=>setIntervalValue(event.target.value)}/>
              {{daily:'天',weekly:'周',monthly:'个月',yearly:'年'}[frequency]}
            </label>
            <label>结束<select value={ending} onChange={event=>setEnding(event.target.value)}>
              <option value="never">持续重复</option><option value="count">按次数</option><option value="until">按日期</option>
            </select></label>
            {ending==='count'&&<label>总次数<input type="number" min="1" step="1" required value={count} onChange={event=>setCount(event.target.value)}/></label>}
            {ending==='until'&&<label>截止日期<input type="date" min={eventStart} required value={until} onChange={event=>setUntil(event.target.value)}/></label>}
          </fieldset>}
        </section>
        {error&&<p role="alert">{error}</p>}
        <footer className="calendar-compose-actions"><button type="button" disabled={saving} onClick={cancelComposer}>取消</button>
          <button className="plugin" disabled={saving||changingDay||!title.trim()}>{saving?'正在保存…':series?'保存整组':'添加日程'}</button>
        </footer>
      </form>
    </CalendarComposer>}
    {!timeline&&retained.length>0&&<p role="status">正在编辑的日程已离开当前视图。草稿已保留，取消后可查看最新状态。</p>}
    {!timeline&&(weekOverview?<section aria-label="本周日程" className="calendar-week-list">
      {agendaDays.map(date=><section key={date}>
        <h4>{date} · 星期{'一二三四五六日'[Temporal.PlainDate.from(date).dayOfWeek-1]}</h4>
        {eventList(agendaRows.filter(row=>row.day===date))}
      </section>)}
      {!agendaDays.length&&readStatus==='ready'&&<p>{rangeRows?'本周没有日程。':'正在读取日程…'}</p>}
    </section>:dayRows.length?eventList(dayRows):readStatus==='ready'&&<p>{rows?'当天没有日程。':'正在读取日程…'}</p>
    )}
    {!composer&&error&&<p role="alert">{error}</p>}
  </div>;
}
