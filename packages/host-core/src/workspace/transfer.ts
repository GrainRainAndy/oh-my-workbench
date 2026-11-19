import {validateWorkspace,type Workspace} from '../../../contracts/src/workspace.ts';
import type {LayoutNode} from '../../../contracts/src/layout.ts';
import {duplicateWorkspace} from './duplicate.ts';

export {validateWorkspace};
export const layoutFileLimit=5*1024*1024;

function presentation(source:Workspace,includeConfig=true):Workspace{
  function clean(node:LayoutNode):LayoutNode{
    if(node.type==='split')return {type:'split',axis:node.axis,ratio:node.ratio,first:clean(node.first),second:clean(node.second)};
    return node.viewInstanceId?{type:'leaf',paneId:node.paneId,viewInstanceId:node.viewInstanceId}:{type:'leaf',paneId:node.paneId};
  }
  const views=Object.fromEntries(Object.entries(source.views).map(([key,v])=>[key,{
    id:v.id,pluginId:v.pluginId,viewType:v.viewType,configVersion:v.configVersion,config:includeConfig?v.config:{},
    stateVersion:v.stateVersion,state:{}
  }]));
  return {schemaVersion:1,id:source.id,name:source.name,revision:0,activePaneId:source.activePaneId,layout:clean(source.layout),views};
}
export function exportLayout(input:Workspace,includeConfig=true){
  const workspace=presentation(validateWorkspace(input),includeConfig);
  const text=JSON.stringify({format:'workbench.layout',version:1,workspace},null,2)+'\n';
  if(new TextEncoder().encode(text).byteLength>layoutFileLimit)throw Error('布局文件超过 5 MiB');
  return text;
}
export function importLayout(text:string){
  if(new TextEncoder().encode(text).byteLength>layoutFileLimit)throw Error('布局文件超过 5 MiB');
  let file;
  try{file=JSON.parse(text);}catch{throw Error('所选文件不是有效的 JSON 布局文件。');}
  if(file?.format!=='workbench.layout')throw Error('请选择从工作台导出的布局 JSON 文件。');
  if(file.version!==1)throw Error('布局文件版本不兼容');
  const workspace=presentation(validateWorkspace(file.workspace));
  return duplicateWorkspace(workspace,workspace.name);
}
