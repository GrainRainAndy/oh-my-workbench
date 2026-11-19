/** @type {import('../../packages/sdk/src/index.ts').BackendHandler} */
export const call=async(service, method, input, context)=>{
  if(service!=='workbench.palette.css')throw Error('INVALID_SERVICE');
  let colors=input;
  if(method==='fromFile'&&context.readSelectedFile){
    colors=new TextDecoder().decode(await context.readSelectedFile()).trim().split(/\s+/);
  }else if(method!=='format')throw Error('INVALID_METHOD');
  if(!Array.isArray(colors)||colors.length>32||!colors.every(color=>/^#[0-9a-f]{6}$/i.test(color)))throw Error('INVALID_PALETTE');
  return ':root {\n'+colors.map((value,index)=>'  --color-'+(index+1)+': '+value+';').join('\n')+'\n}';
};
