import {validateLayout, type LayoutNode} from './layout.ts';

import {assertJson} from './json.ts';

export interface Workspace {
  schemaVersion: 1;
  id: string;
  name: string;
  revision: number;
  layout: LayoutNode;
  activePaneId: string;
  views: Record<string, {id:string; pluginId:string; viewType:string; configVersion:number; stateVersion:number; config:object; state:object}>;
}
export function validateWorkspace(input:unknown):Workspace {
  assertJson(input);
  const w = input as unknown as Workspace;
  const id = (s:unknown) => typeof s === 'string' && !!s.trim();
  const version = (n:number) => Number.isSafeInteger(n) && n >= 1;
  const record = (v:unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!record(w) || w.schemaVersion !== 1 || !id(w.id) || !id(w.name) ||
      !Number.isSafeInteger(w.revision) || w.revision < 0 || !record(w.views)) throw Error('工作区格式无效');
  const {paneIds,viewIds} = validateLayout(w.layout);
  if (!paneIds.has(w.activePaneId) || Object.keys(w.views).length !== viewIds.size) throw Error('工作区引用无效');
  for (const key of viewIds) {
    const v = w.views[key];
    if (!Object.hasOwn(w.views,key) || !v || v.id !== key || !id(v.pluginId) || !id(v.viewType) ||
        !version(v.configVersion) || !version(v.stateVersion) || !record(v.config) || !record(v.state)) throw Error('视图实例无效');
  }
  return w;
}
