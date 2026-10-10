import { cp,mkdir } from 'node:fs/promises';
await mkdir('.next/standalone/.next',{recursive:true});
await cp('.next/static','.next/standalone/.next/static',{recursive:true});
process.env.PORT ||= '3100';
process.env.HOSTNAME = '127.0.0.1';
await import('../.next/standalone/server.js');
