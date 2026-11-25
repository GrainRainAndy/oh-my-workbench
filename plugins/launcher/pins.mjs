export const service='workbench.launcher.library',version='1.0.0';
export const viewKey=({pluginId,type})=>JSON.stringify([pluginId,type]);
export const viewReference=({pluginId,type})=>({pluginId,type});

const nonEmpty=value=>typeof value==='string'&&value.length>0;
export function pinReferences(config){
  if(!Array.isArray(config?.pinnedViews))return [];
  return config.pinnedViews.filter(view=>nonEmpty(view?.pluginId)&&nonEmpty(view.type)).map(viewReference);
}
export function localTargets(config){
  if(!Array.isArray(config?.targets))return [];
  return config.targets.filter(target=>nonEmpty(target?.id)&&nonEmpty(target.label)&&['app','folder'].includes(target.kind))
    .map(({id,kind,label})=>({id,kind,label}));
}

export function pinnedViews(config,catalog){
  const available=new Map(catalog.map(view=>[viewKey(view),view]));
  const keys=new Set(pinReferences(config).map(viewKey));
  return [...keys].map(key=>available.get(key)).filter(Boolean);
}
