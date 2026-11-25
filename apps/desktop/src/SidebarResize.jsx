import React,{useLayoutEffect,useRef,useState} from 'react';

const key='workbench.sidebarWidth';
const min=144;
const limit=n=>Math.max(min,Math.min(n,360,Math.floor(innerWidth*.4)));
const defaultWidth=()=>innerWidth<=760?154:innerWidth<=980?178:216;
export default function SidebarResize(){
  const [preferred,setPreferred]=useState(()=>{
    const n=Number(localStorage.getItem(key));
    return Number.isFinite(n)&&n>=min?n:null;
  });
  const [width,setWidth]=useState(()=>limit(preferred??defaultWidth()));
  const drag=useRef(null);
  useLayoutEffect(()=>{
    const resize=()=>setWidth(limit(preferred??defaultWidth()));
    resize();
    window.addEventListener('resize',resize);
    return ()=>window.removeEventListener('resize',resize);
  },[preferred]);
  useLayoutEffect(()=>{
    document.documentElement.style.setProperty('--sidebar-width',width+'px');
  },[width]);
  useLayoutEffect(()=>()=>drag.current?.(),[]);
  function save(n){
    const next=limit(n);
    setWidth(next);
    setPreferred(next);
    localStorage.setItem(key,String(next));
  }
  return <div className="sidebar-resize" role="separator" tabIndex={0} aria-label="侧栏宽度" aria-controls="workbench-navigation"
    aria-orientation="vertical" aria-valuemin={min} aria-valuemax={limit(360)} aria-valuenow={width} aria-valuetext={width+' 像素'}
    onPointerDown={e=>{
      if(e.button!==0||drag.current)return;
      const pointer=e.pointerId,start=e.clientX;
      const position=event=>limit(width+event.clientX-start);
      function move(event){if(event.pointerId===pointer)setWidth(position(event));}
      function finish(event){
        if(event.pointerId!==pointer)return;
        cleanup();
        save(position(event));
      }
      function cancel(){cleanup();setWidth(width);}
      function cleanup(){
        window.removeEventListener('pointermove',move);
        window.removeEventListener('pointerup',finish);
        window.removeEventListener('pointercancel',cancel);
        window.removeEventListener('blur',cancel);
        drag.current=null;
      }
      drag.current=cleanup;
      e.preventDefault();
      window.addEventListener('pointermove',move);
      window.addEventListener('pointerup',finish);
      window.addEventListener('pointercancel',cancel);
      window.addEventListener('blur',cancel);
    }}
    onDoubleClick={()=>{localStorage.removeItem(key);setPreferred(null);setWidth(defaultWidth());}}
    onKeyDown={e=>{
      const next={ArrowLeft:width-8,ArrowRight:width+8,Home:min,End:limit(360)}[e.key];
      if(next!==undefined){e.preventDefault();save(next);}
    }}/>;
}
