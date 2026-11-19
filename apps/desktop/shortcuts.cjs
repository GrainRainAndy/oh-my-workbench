// Physical macOS virtual key codes correspond to the KeyboardEvent.code captured by the UI.
const keys={A:0,S:1,D:2,F:3,H:4,G:5,Z:6,X:7,C:8,V:9,B:11,Q:12,W:13,E:14,R:15,Y:16,T:17,
  1:18,2:19,3:20,4:21,6:22,5:23,9:25,7:26,8:28,0:29,O:31,U:32,I:34,P:35,L:37,J:38,K:40,N:45,M:46,Space:49};
const modifiers={Command:256,Shift:512,Alt:2048,Control:4096};
const active=new Map();
const native=require('./dist-main/shortcuts.node');
module.exports={
  register(value,callback){
    const parts=value.split('+'),key=parts.pop();
    if(!Object.hasOwn(keys,key)||parts.some(part=>!Object.hasOwn(modifiers,part)))return false;
    const id=native.bind(keys[key],parts.reduce((bits,part)=>bits|modifiers[part],0),callback);
    if(id)active.set(value,id);
    return Boolean(id);
  },
  unregister(value){
    if(active.has(value)){native.unbind(active.get(value));active.delete(value);}
  },
  isRegistered:value=>active.has(value)
};
