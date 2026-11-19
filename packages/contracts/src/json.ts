export type JsonValue=null|boolean|number|string|JsonValue[]|{[key:string]:JsonValue};

/** Reject values whose representation would change while saving JSON in SQLite. */
export function assertJson(value:unknown):asserts value is JsonValue {
  const ancestors=new Set<object>();
  function visit(item:unknown,depth:number):void {
    if(item===null||typeof item==='boolean'||typeof item==='string')return;
    if(typeof item==='number'&&Number.isFinite(item))return;
    if(typeof item!=='object'||!item||depth>128||ancestors.has(item))throw Error('工作区包含无效 JSON 值');
    ancestors.add(item);
    if(Array.isArray(item)){
      if(Object.keys(item).length!==item.length)throw Error('工作区数组格式无效');
      for(let index=0;index<item.length;index++)visit(item[index],depth+1);
    }else{
      const prototype=Object.getPrototypeOf(item);
      if(prototype!==Object.prototype&&prototype!==null)throw Error('工作区仅支持 JSON 对象');
      for(const child of Object.values(item))visit(child,depth+1);
    }
    ancestors.delete(item);
  }
  visit(value,0);
}
