const {DatabaseSync}=require('node:sqlite');
function openPreferences(file,{shortcuts,show,setTray}){
  const db=new DatabaseSync(file);
  db.exec("CREATE TABLE IF NOT EXISTS desktop (id INTEGER PRIMARY KEY CHECK(id=1),tray INTEGER NOT NULL,shortcut TEXT NOT NULL); INSERT OR IGNORE INTO desktop VALUES(1,1,'')");
  const saved=()=>db.prepare('SELECT tray,shortcut FROM desktop WHERE id=1').get();
  let active='';
  function read(){
    const row=saved();
    return {tray:!!row.tray,shortcut:row.shortcut,registered:!!active};
  }
  const initial=saved();
  setTray(!!initial.tray);
  if(initial.shortcut&&shortcuts.register(initial.shortcut,show))active=initial.shortcut;
  return {read,setTray(enabled){
    if(typeof enabled!=='boolean')throw Error('菜单栏设置无效');
    const previous=!!saved().tray;
    setTray(enabled);
    try{db.prepare('UPDATE desktop SET tray=? WHERE id=1').run(Number(enabled));}
    catch(error){setTray(previous);throw error;}
    return read();
  },setShortcut(value){
    if(typeof value!=='string'||value&&!/^(?:Control\+)?(?:Alt\+)?(?:Shift\+)?(?:Command\+)?(?:[A-Z0-9]|Space)$/.test(value))throw Error('快捷键格式无效');
    if(value&&!/Control\+|Alt\+|Command\+/.test(value))throw Error('快捷键需要包含 Control、Option 或 Command');
    if(value&&value===active)return read();
    if(value&&!shortcuts.register(value,show))throw Error('此快捷键已被占用或不可用');
    try{db.prepare('UPDATE desktop SET shortcut=? WHERE id=1').run(value);}
    catch(error){if(value)shortcuts.unregister(value);throw error;}
    if(active)shortcuts.unregister(active);
    active=value;
    return read();
  },close(){if(active)shortcuts.unregister(active);db.close();}};
}
module.exports={openPreferences};
