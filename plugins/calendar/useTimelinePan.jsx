import {useLayoutEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {moveTimelinePan,settlingPage,stepTimelineDay,timelineDayCount,timelinePanBounds} from './src/time-grid.mjs';

const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

export default function useTimelinePan(root,{scene,page,disabled,onPage,onCount}){
  const input=useRef({page,disabled,onPage,onCount});
  input.current={page,disabled,onPage,onCount};
  const [preview,setPreview]=useState(null);

  useLayoutEffect(()=>{
    const element=root.current;
    let pan=null,pointer=null,suppressClick=false,measuredWidth=-1;
    function paint(x){
      const active=pan;
      active.x=x;
      const {width,min,max}=active;
      const column=clamp(Math.round(x/width),min,max);
      if(column!==active.column){
        // Change the rendered dates and their offset before the same frame is painted.
        active.column=column;
        flushSync(()=>setPreview(-column));
      }
      if(pan!==active)return false;
      const offset=x-column*width;
      for(const track of active.tracks)track.style.transform='translate3d('+offset+'px,0,0)';
      return true;
    }
    function reset(render=true){
      const captured=pointer;
      pointer=null;
      if(captured&&element.hasPointerCapture(captured.id))element.releasePointerCapture(captured.id);
      if(!pan)return;
      clearTimeout(pan.timer);
      cancelAnimationFrame(pan.frame);
      for(const track of pan.tracks)track.style.removeProperty('transform');
      element.removeAttribute('data-panning');
      pan=null;
      if(render)setPreview(null);
    }
    function begin(){
      if(pan){
        clearTimeout(pan.timer);
        if(pan.frame){
          cancelAnimationFrame(pan.frame);
          pan.frame=0;
          pan.lastTime=performance.now();
          pan.velocity=0;
        }
        return true;
      }
      const tracks=[...element.querySelectorAll('.cal-page-track')];
      const width=element.querySelector('.cal-grid-head .cal-page:not([data-side]) > button').getBoundingClientRect().width;
      if(width<1)return false;
      const page=input.current.page;
      const [min,max]=timelinePanBounds(page);
      pan={tracks,width,page,min,max,column:0,x:0,velocity:0,lastTime:performance.now(),timer:0,frame:0,committing:false};
      element.dataset.panning='';
      setPreview(0);
      return true;
    }
    function move(delta,fromWheel=false){
      if(!begin())return;
      const now=performance.now();
      const {width,min,max}=pan;
      // A single notched wheel event turns at most one day. A stream can keep moving.
      const travel=fromWheel?clamp(delta,-width,width):delta;
      const x=moveTimelinePan(pan.x,travel,width,min*width,max*width);
      const elapsed=Math.max(8,now-pan.lastTime);
      pan.velocity=elapsed>90?0:.5*pan.velocity+.5*(x-pan.x)/elapsed;
      pan.lastTime=now;
      paint(x);
    }
    function settle(cancelled=false){
      if(!pan)return;
      const active=pan;
      clearTimeout(active.timer);
      const {width,x,lastTime,min,max}=active;
      const start=performance.now();
      const velocity=pan.velocity*Math.exp(-(start-lastTime)/80);
      const completed=Math.trunc(x/width);
      const nearest=completed+settlingPage(x-completed*width,velocity,width);
      const column=cancelled?0:clamp(nearest,min,max);
      const page=column?stepTimelineDay(active.page,-column):null;
      const target=column*width;
      function finish(){
        if(page&&!input.current.disabled&&input.current.onPage){
          active.committing=true;
          if(!paint(target))return;
          const accepted=input.current.onPage(page,()=>{if(pan===active)reset();});
          if(accepted)return;
        }
        reset();
      }
      if(matchMedia('(prefers-reduced-motion: reduce)').matches){finish();return;}
      const offset=x-target,stiffness=.048;
      function tick(now){
        if(pan!==active)return;
        const t=now-start;
        const remaining=(offset+(velocity+stiffness*offset)*t)*Math.exp(-stiffness*t);
        if(Math.abs(remaining)<.3&&t>32||t>220){finish();return;}
        if(paint(clamp(target+remaining,Math.min(x,target),Math.max(x,target))))
          active.frame=requestAnimationFrame(tick);
      }
      active.frame=requestAnimationFrame(tick);
    }
    function wheel(event){
      if(input.current.disabled||pan?.committing||event.ctrlKey||event.metaKey||pointer?.claimed)return;
      // Reading deltaMode first keeps Chromium's units consistent for wheel devices.
      const mode=event.deltaMode;
      const shifted=event.shiftKey&&!event.deltaX;
      const delta=shifted?event.deltaY:event.deltaX;
      if(!delta||!shifted&&Math.abs(delta)<=Math.abs(event.deltaY))return;
      event.preventDefault();
      const unit=mode===1?16:mode===2?element.clientWidth:1;
      move(-delta*unit,true);
      if(pan)pan.timer=setTimeout(settle,55);
    }
    function down(event){
      suppressClick=false;
      if(input.current.disabled||pan?.committing||!event.isPrimary||event.button!==0||pointer)return;
      pointer={id:event.pointerId,x:event.clientX,y:event.clientY,claimed:false};
      if(pan?.frame){
        begin();
        element.setPointerCapture(event.pointerId);
        pointer.claimed=true;
        suppressClick=true;
        event.preventDefault();
      }
    }
    function drag(event){
      if(pointer?.id!==event.pointerId)return;
      if(input.current.disabled){reset();return;}
      const dx=event.clientX-pointer.x;
      if(!pointer.claimed){
        const dy=event.clientY-pointer.y;
        if(Math.max(Math.abs(dx),Math.abs(dy))<6)return;
        if(Math.abs(dx)<=Math.abs(dy)){pointer=null;return;}
        element.setPointerCapture(event.pointerId);
        pointer.claimed=true;
        suppressClick=true;
        window.getSelection()?.removeAllRanges();
      }
      event.preventDefault();
      pointer.x=event.clientX;
      if(dx)move(dx);
    }
    function end(event){
      if(pointer?.id!==event.pointerId)return;
      const {claimed}=pointer;
      pointer=null;
      if(claimed)settle(event.type!=='pointerup');
    }
    function click(event){
      if(!suppressClick||event.detail===0)return;
      suppressClick=false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    function leave(){
      if(pointer&&!pointer.claimed)pointer=null;
    }
    const observer=new ResizeObserver(([entry])=>{
      const width=entry.contentRect.width;
      if(width===measuredWidth||!width)return;
      if(measuredWidth>=0)reset();
      measuredWidth=width;
      input.current.onCount(timelineDayCount(width));
    });
    observer.observe(element);
    const listeners={wheel,pointerdown:down,pointermove:drag,pointerleave:leave,pointerup:end,pointercancel:end,lostpointercapture:end};
    for(const [name,listener] of Object.entries(listeners))element.addEventListener(name,listener,{passive:false});
    element.addEventListener('click',click,true);
    return ()=>{
      observer.disconnect();
      reset(false);
      for(const [name,listener] of Object.entries(listeners))element.removeEventListener(name,listener);
      element.removeEventListener('click',click,true);
    };
  },[root,scene]);

  // A new scene drops any previous preview, even when a save completes mid-settle.
  useLayoutEffect(()=>setPreview(null),[scene]);
  return preview;
}
