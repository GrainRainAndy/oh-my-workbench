import React,{useState} from 'react';

const themes={system:'跟随系统',light:'浅色',dark:'深色'};
const preference='workbench.appearance';
export default function Appearance(){
  const [theme,setTheme]=useState(document.documentElement.dataset.appearance);
  return <label className="appearance">
    <span>外观</span>
    <select aria-label="外观" value={theme} onChange={event=>{
      const next=event.target.value;
      localStorage.setItem(preference,next);
      document.documentElement.dataset.appearance=next;
      setTheme(next);
    }}>
      {Object.entries(themes).map(([value,title])=><option key={value} value={value}>{title}</option>)}
    </select>
  </label>;
}
