import {readdirSync,readFileSync,realpathSync,existsSync} from 'node:fs';
import {dirname,join,relative,resolve,sep,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isBuiltin} from 'node:module';
import ts from 'typescript';

const project=fileURLToPath(new URL('../',import.meta.url));
function inside(directory,path){
  const part=relative(directory,path);
  return part!== '..' && !part.startsWith('..'+sep) && !isAbsolute(part);
}
function* files(directory,plugin,root,errors){
  for(const entry of readdirSync(directory,{withFileTypes:true})){
    const filename=join(directory,entry.name);
    if(entry.isSymbolicLink()){
      if(!existsSync(filename)||!inside(plugin,realpathSync(filename))){
        errors.push(relative(root,filename)+' 符号链接未指向插件内的文件或目录');
        continue;
      }
    }
    if(entry.isDirectory() && entry.name!=='node_modules')yield* files(filename,plugin,root,errors);
    else if(/\.[cm]?[jt]sx?$/.test(entry.name))yield filename;
  }
}
export function inspectPlugins(root=project){
  root=realpathSync(root);
  const errors=[];
  const sdk=join(root,'packages/sdk/src/index.ts');
  const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
  const dependencies=new Set(Object.keys(pkg.dependencies??{}));
  for(const entry of readdirSync(join(root,'plugins'),{withFileTypes:true})){
    if(!entry.isDirectory())continue;
    const plugin=join(root,'plugins',entry.name);
    for(const file of files(plugin,plugin,root,errors)){
      const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
      function check(specifier){
        if(!specifier)return;
        function report(reason){
          const {line}=source.getLineAndCharacterOfPosition(specifier.getStart());
          errors.push(relative(root,file)+':'+(line+1)+' '+reason);
        }
        if(!ts.isStringLiteralLike(specifier))return report('模块路径需要可静态解析');
        const name=specifier.text;
        if(name.startsWith('.')||isAbsolute(name)){
          const target=resolve(dirname(file),name);
          const actual=existsSync(target)?realpathSync(target):target;
          if(inside(plugin,actual)||actual===sdk)return;
        }else if(isBuiltin(name)||dependencies.has(name.split('/').slice(0,name.startsWith('@')?2:1).join('/')))return;
        report('跨越插件依赖边界 '+name);
      }
      function visit(node){
        if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))check(node.moduleSpecifier);
        if(ts.isExternalModuleReference(node))check(node.expression);
        if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument))check(node.argument.literal);
        if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||
            ts.isIdentifier(node.expression)&&node.expression.text==='require'))check(node.arguments[0]);
        ts.forEachChild(node,visit);
      }
      visit(source);
    }
  }
  return errors;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const violations=inspectPlugins();
  if(violations.length){console.error(violations.join('\n'));process.exitCode=1;}
  else console.log('Plugin import boundaries passed.');
}
