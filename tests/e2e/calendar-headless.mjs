// Uses a disposable browser profile and no desktop windows or Electron bridges.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const root=mkdtempSync(join(tmpdir(),'workbench-calendar-headless-'));
try{
  await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {flushSync} from 'react-dom';
    import TimeGrid from './plugins/calendar/TimeGrid.jsx';
    const day='2031-05-05';
    const rows=[['交接','09:00','09:05'],['讨论','09:00','10:00']].map(([title,time,endTime])=>({
      day,id:title,title,timing:{start:day,end:day,time,endTime,timeZone:'Asia/Shanghai'}
    }));
    const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
    for(const row of rows){
      const t=row.timing;
      const instant=value=>Temporal.PlainDateTime.from(day+'T'+value).toZonedDateTime(zone).toInstant();
      const start=instant(t.time),end=instant(t.endTime);
      // Simulate records authored in another zone with the same absolute instants.
      const foreign=start.toZonedDateTimeISO('Pacific/Kiritimati');
      row.day=foreign.toPlainDate().toString();
      Object.assign(t,{start:row.day,time:foreign.toPlainTime().toString({smallestUnit:'minute'}),
        timeZone:'Pacific/Kiritimati',startInstant:start.toString(),endInstant:end.toString()});
    }
    const root=createRoot(document.querySelector('main'));
    flushSync(()=>root.render(<TimeGrid day={day} rows={rows} count={1} onCount={()=>{}} onEvent={r=>document.body.dataset.selected=r.title}/>));
    const blocks=document.querySelectorAll('.cal-day-track button');
    const [a,b]=Array.from(blocks,el=>el.getBoundingClientRect()).sort((x,y)=>x.height-y.height);
    const short=document.querySelector('.cal-short-events button');
    if(short.querySelector('time').textContent!=='09:00')throw Error('Wrong display-zone label');
    const r=short.getBoundingClientRect();
    short.click();
    document.body.dataset.result=JSON.stringify({height:a.height,overlap:a.left<b.right&&b.left<a.right,shortHeight:r.height,clipped:r.right>document.querySelector('.cal-timegrid').getBoundingClientRect().right,shortCount:document.querySelectorAll('.cal-short-events button').length});
    const next='2031-05-06',scroller=document.querySelector('.cal-hours-scroll');
    const evening={day:next,id:'night',title:'晚间交接',timing:{start:next,end:next,time:'21:00',endTime:'21:30'}};
    function renderNext(records){
      flushSync(()=>root.render(<TimeGrid day={next} count={1} rows={records} onCount={()=>{}}/>));
    }
    renderNext(null);
    renderNext([evening]);
    if(scroller.scrollTop!==8*62-6)throw Error('Initial timeline presentation does not match reviewed start hour');
    scroller.scrollTop=21*62-12;
    const night=document.querySelector('.cal-day-track button').getBoundingClientRect();
    const viewport=scroller.getBoundingClientRect();
    if(night.top<viewport.top||night.bottom>viewport.bottom)throw Error('Evening meeting outside the scrolled viewport');
    scroller.scrollTop=240;
    renderNext([evening,{...evening,id:'early',timing:{...evening.timing,time:'06:00',endTime:'06:30'}}]);
    document.body.dataset.preserved=String(scroller.scrollTop===240);
    for(const [width,count] of [[230,1],[440,3],[760,7]]){
      document.querySelector('main').style.width=width+'px';
      const allDay={day,id:'long',title:'跨团队项目进度与风险复核'.repeat(12)};
      flushSync(()=>root.render(<TimeGrid day={day} count={count} rows={[allDay,...rows]} onCount={()=>{}}/>));
      const grid=document.querySelector('.cal-timegrid');
      const headers=grid.querySelectorAll('.cal-grid-head button');
      const tracks=grid.querySelectorAll('.cal-day-track');
      if(headers.length!==count||tracks.length!==count||grid.scrollWidth>width)
        throw Error('Unexpected timeline layout at '+width);
      const label=grid.querySelector('.cal-allday button');
      if(label.clientWidth>=label.scrollWidth||label.getBoundingClientRect().right>headers[0].getBoundingClientRect().right+1)
        throw Error('All-day title escaped its date column at '+width);
    }
    document.body.dataset.widths='230,440,760';
    const durations=['09:05','09:30','10:00'].map((endTime,index)=>({
      day,id:String(index),title:'例会',timing:{start:day,end:day,time:'09:00',endTime}
    }));
    flushSync(()=>root.render(<TimeGrid day={day} count={1} rows={durations} onCount={()=>{}}/>));
    const labels=durations.map(row=>{
      const block=document.querySelector('.cal-day-track button[title*="'+row.timing.endTime+' "]');
      return ['strong','small'].filter(tag=>block.querySelector(tag).getClientRects().length).join('+');
    });
    document.body.dataset.labelDensity=labels.join('/');
    const instant=(date,time)=>Temporal.PlainDateTime.from(date+'T'+time).toZonedDateTime(zone).toInstant().toString();
    const overnight=[day,next].map(date=>({id:'night-shift',title:'夜间交接',day:date,
      timing:{startInstant:instant(day,'23:30'),endInstant:instant(next,'01:00')}}));
    flushSync(()=>root.render(<TimeGrid day={day} count={3} rows={overnight} onCount={()=>{}}
      onEvent={row=>document.body.dataset.continuation=row.day}/>));
    document.querySelectorAll('.cal-day-track')[1].querySelector('button').click();

  `},bundle:true,minify:true,outfile:join(root,'fixture.js'),define:{'process.env.NODE_ENV':'"production"'}});
  const css=readFileSync('apps/desktop/src/style.css','utf8');
  writeFileSync(join(root,'fixture.html'),`<!doctype html><meta charset="utf-8"><style>${css}main{width:230px;padding:0}</style><link rel="stylesheet" href="fixture.css"><main></main><script src="fixture.js"></script>`);
  const browser=process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const html=execFileSync(browser,['--headless','--disable-gpu','--no-first-run','--disable-background-networking','--disable-extensions','--user-data-dir='+join(root,'profile'),'--dump-dom',pathToFileURL(resolve(root,'fixture.html')).href],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});
  assert.match(html,/data-label-density="\/strong\/strong\+small"/);
  assert.match(html,/data-continuation="2031-05-06"/);
  assert.match(html,/data-widths="230,440,760"/);
  assert.match(html,/data-preserved="true"/);
  assert.match(html,/data-selected="交接"/);
  const result=JSON.parse(html.match(/data-result="([^"]+)"/)[1].replaceAll('&quot;','"'));
  assert.ok(Math.abs(result.height-(5/60*62-2))<.1);
  assert.equal(result.overlap,false);
  assert.equal(result.shortCount,1);
  assert.ok(result.shortHeight>=24&&!result.clipped);
  console.log(result);
}finally{rmSync(root,{recursive:true,force:true});}
