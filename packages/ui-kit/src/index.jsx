import React from 'react';

const icons={
  add:<path d="M12 5v14M5 12h14"/>,
  close:<path d="M6 6l12 12M18 6L6 18"/>,
  more:[5,12,19].map(cx=><circle key={cx} cx={cx} cy="12" r="1" fill="currentColor" stroke="none"/>),
  left:<path d="M15 5l-7 7 7 7"/>,
  right:<path d="M9 5l7 7-7 7"/>,
  down:<path d="M6 9l6 6 6-6"/>,
  check:<path d="M5 12l4 4L19 6"/>,
  workbench:<><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M10 3v18M10 12h11"/></>,
  workspace:<><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></>,
  horizontal:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/></>,
  vertical:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 12h18"/></>,
  maximize:<rect x="3" y="3" width="18" height="18" rx="2"/>,
  restore:<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>,
  calendar:<><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
  clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  note:<><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  flag:<path d="M5 21V4M5 5h14l-3 4 3 4H5"/>,
  repeat:<path d="M3 8h16l-4-4M19 8l-4 4M21 16H5l4 4M5 16l4-4"/>,
  checklist:<path d="M4 7l2 2 4-5M12 7h8M4 16l2 2 4-5M12 16h8"/>,
  launcher:[3,14].flatMap(x=>[3,14].map(y=><rect key={x+'/'+y} x={x} y={y} width="7" height="7" rx="2"/>)),
  folder:<path d="M3 7V5a2 2 0 012-2h5l2 3h7a2 2 0 012 2v10a3 3 0 01-3 3H6a3 3 0 01-3-3V7z"/>,
  app:<><rect x="4" y="3" width="16" height="18" rx="4"/><path d="M8 7h8M8 11h8M8 15h5"/></>,
  settings:<><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></>,
  plugins:<path d="M9 3h6v5h5v6h-5v6H9v-5H4V9h5V3z"/>,
  jobs:<path d="M3 12h4l3-7 4 14 3-7h4"/>,
  palette:<path d="M12 3a9 9 0 1 0 0 18c3 0 1-3 3-4s6 0 6-5a9 9 0 0 0-9-9z M7 11h1 M10 7h1 M15 7h1 M17 11h1"/>,
  counter:<path d="M9 4 6 20 M17 4l-3 16 M4 9h16 M3 15h16"/>,
  chart:<path d="M4 4v16h17 M8 16v-5 M13 16V6 M18 16v-8"/>,
};
export function ViewIcon({kind}){
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65"
    strokeLinecap="round" strokeLinejoin="round">{Object.hasOwn(icons,kind)?icons[kind]:icons.workbench}</svg>;
}

export function AddButton({tone,label,onClick,disabled,expanded,hasPopup,className}){
  return <button type="button" className={className?'wb-add '+className:'wb-add'} data-tone={tone} aria-label={label} title={label}
    aria-expanded={expanded} aria-haspopup={hasPopup} onClick={onClick} disabled={disabled}>
    <ViewIcon kind={tone==='todo'&&expanded?'close':'add'}/>
  </button>;
}

export function RecordDialog({title,onCancel,children}){
  const ref=React.useRef(null);
  const headingId=React.useId();
  React.useLayoutEffect(()=>{
    const element=ref.current;
    element.showModal();
    element.querySelector('input:not([type=checkbox]), textarea, select')?.focus();
    return ()=>element.close();
  },[]);
  return <dialog ref={ref} className="wb-record-dialog" aria-labelledby={headingId}
    onCancel={event=>{event.preventDefault();onCancel();}}>
    <h2 id={headingId}>{title}</h2><button className="record-close" type="button" aria-label="关闭" onClick={onCancel}>
      <ViewIcon kind="close"/>
    </button>{children}
  </dialog>;
}

export function menuPosition(event){
  event.preventDefault();
  const box=event.currentTarget.getBoundingClientRect();
  return {x:event.clientX||box.left,y:event.clientY||box.bottom,trigger:event.currentTarget};
}

export function ActionMenu({position,actions,close,label}){
  const ref=React.useRef(null);
  React.useLayoutEffect(()=>{
    const el=ref.current;
    el.showModal();
    el.style.left=Math.max(4,Math.min(position.x,innerWidth-el.offsetWidth-4))+'px';
    el.style.top=Math.max(4,Math.min(position.y,innerHeight-el.offsetHeight-4))+'px';
    el.querySelector('button')?.focus();
    return ()=>{el.close();if(position.trigger?.isConnected)position.trigger.focus({preventScroll:true});};
  },[position]);
  return <dialog ref={ref} className="action-menu" role="menu" aria-label={label}
    onCancel={e=>{e.preventDefault();close();}}
    onPointerDown={e=>{const box=ref.current.getBoundingClientRect();if(e.target===ref.current&&(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom))close();}}
    onKeyDown={e=>{
      const buttons=Array.from(ref.current.querySelectorAll('button'));
      const i=buttons.indexOf(document.activeElement);
      const next={ArrowDown:(i+1)%buttons.length,ArrowUp:(i+buttons.length-1)%buttons.length,Home:0,End:buttons.length-1}[e.key];
      if(next!==undefined){e.preventDefault();buttons[next]?.focus();}
      if(e.key==='Tab'){e.preventDefault();close();}
    }}>
    {actions.map(([name,action])=><button key={name} role="menuitem" onClick={()=>{close();action();}}>{name}</button>)}
  </dialog>;
}
