import React,{useState,useEffect} from 'react';
import Appearance from './Appearance.jsx';

function shortcutLabel(value){
  return value.replace('Control+','⌃').replace('Alt+','⌥').replace('Shift+','⇧').replace('Command+','⌘').replace('Space','空格');
}
export default function DesktopSettings({includeAppearance=false}){
  const [settings,setSettings]=useState(null),[recording,setRecording]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [login,setLogin]=useState(null);
  const [receipt,setReceipt]=useState('');
  useEffect(()=>{window.desktopPreferences?.loginStatus().then(setLogin).catch(()=>setError('无法读取 macOS 登录项状态'));},[]);
  async function changeLogin(){
    setBusy(true);setError('');setReceipt('');
    try{setLogin(await window.desktopPreferences.setLogin(!login));setReceipt('登录项已更新。');}
    catch(e){setError(e.message.split('Error: ').at(-1));}
    finally{setBusy(false);}
  }
  useEffect(()=>{window.desktopPreferences?.read().then(setSettings).catch(()=>setError('无法读取桌面设置'));},[]);
  async function apply(request){
    setBusy(true);setError('');setReceipt('');
    try{setSettings(await request);setRecording(false);setReceipt('桌面设置已保存。');}
    catch(e){setError(e.message.split('Error: ').at(-1));}
    finally{setBusy(false);}
  }
  function capture(e){
    if(!recording||e.key==='Tab')return;
    e.preventDefault();
    if(e.key==='Escape'){setRecording(false);return;}
    if(['Alt','Control','Shift','Meta'].includes(e.key))return;
    const key=e.code==='Space'?'Space':/^(Key[A-Z]|Digit\d)$/.test(e.code)?e.code.slice(-1):null;
    if(!key||!(e.ctrlKey||e.altKey||e.metaKey)){setError('请按修饰键和字母、数字或空格');return;}
    const value=[e.ctrlKey&&'Control',e.altKey&&'Alt',e.shiftKey&&'Shift',e.metaKey&&'Command',key].filter(Boolean).join('+');
    apply(window.desktopPreferences.setShortcut(value));
  }
  return <section className="desktop-settings" aria-busy={busy}><h2 id={includeAppearance?'desktop-settings-title':undefined}>桌面设置</h2>
    {includeAppearance&&<Appearance/>}
    {login!==null&&<div><span>登录时在后台启动</span><button className="toggle" role="switch" aria-label="登录时在后台启动" aria-checked={login} disabled={busy} onClick={changeLogin}><i/></button></div>}
    {settings&&<><div><span>显示菜单栏图标</span><button className="toggle" role="switch" aria-label="显示菜单栏图标" aria-checked={settings.tray} disabled={busy} onClick={()=>apply(window.desktopPreferences.setTray(!settings.tray))}><i/></button></div>
    <div><span>唤出工作台</span><button className="shortcut" disabled={busy} onClick={()=>setRecording(true)} onBlur={()=>setRecording(false)} onKeyDown={capture}>{recording?'按下组合键':shortcutLabel(settings.shortcut)||'设置快捷键'}</button>
    {settings.shortcut&&<button disabled={busy} onClick={()=>apply(window.desktopPreferences.setShortcut(''))}>清除</button>}</div>
    {settings.shortcut&&!settings.registered&&<p role="status">已保存的快捷键当前不可用，请重新设置。</p>}</>}
    {receipt&&<p role="status">{receipt}</p>}
    {error&&<p role="alert">{error}</p>}</section>;
}
