import {validateWorkspace, type Workspace} from '../../../contracts/src/workspace.ts';
import type {LayoutNode} from '../../../contracts/src/layout.ts';

export function duplicateWorkspace(source:Workspace, name:string):Workspace {
  validateWorkspace(source);
  const views:Workspace['views']={};
  let activePaneId='';
  function copy(node:LayoutNode):LayoutNode {
    if(node.type==='split') return {...node,first:copy(node.first),second:copy(node.second)};
    const paneId=crypto.randomUUID();
    if(node.paneId===source.activePaneId) activePaneId=paneId;
    if(!node.viewInstanceId) return {type:'leaf',paneId};
    const viewInstanceId=crypto.randomUUID();
    const original=source.views[node.viewInstanceId];
    views[viewInstanceId]={...structuredClone(original),id:viewInstanceId,state:{}};
    return {type:'leaf',paneId,viewInstanceId};
  }
  const layout=copy(source.layout);
  return validateWorkspace({...source,id:crypto.randomUUID(),name,revision:0,layout,views,activePaneId});
}
