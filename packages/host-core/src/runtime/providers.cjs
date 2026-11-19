function providersFor(plugins,dependency){
  return plugins.filter(plugin=>
    (dependency.provider===undefined||dependency.provider===plugin.id)&&
    plugin.services?.some(service=>service.id===dependency.id&&service.version===dependency.version)
  );
}
module.exports={providersFor};
