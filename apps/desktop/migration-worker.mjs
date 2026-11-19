import {pathToFileURL} from 'node:url';
const [entry,dataDirectory]=process.argv.slice(2);
const {migrate}=await import(pathToFileURL(entry).href);
await migrate({dataDirectory});
