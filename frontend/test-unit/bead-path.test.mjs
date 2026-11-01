import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../components/peace-room/bead-path.ts',import.meta.url),'utf8');
const {BEAD_COUNT,pathPoint,pathFraction,pathDelta,crossedCount,snapCount}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('equal arc positions round trip across the seam and both directions',()=>{for(let i=0;i<BEAD_COUNT;i++){const a=pathPoint(i),b=pathPoint(i+1);assert.ok(Math.abs(pathDelta(pathFraction(a.x,a.y),pathFraction(b.x,b.y))-1)<.001);assert.ok(Math.abs(pathDelta(pathFraction(b.x,b.y),pathFraction(a.x,a.y))+1)<.001);}});
test('jitter cannot accumulate counts; full crossings and reversal agree with final alignment',()=>{let n=0;for(let i=0;i<100;i++)n=crossedCount(i%2?.15:0,n);assert.equal(n,0);for(let p=0;p<109;p+=.125)n=crossedCount(p,n);assert.equal(n,108);n=crossedCount(105,n);assert.equal(n,105);assert.equal(snapCount(105.2),105);assert.equal(snapCount(105.7),106);assert.equal(snapCount(-3),0);});
