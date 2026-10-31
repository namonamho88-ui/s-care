import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../components/war-room/room-identity.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {trainingRoomId,peaceRoomId}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('same named team converges across Unicode, spacing and case; distinct teams stay separate',async()=>{
 assert.equal(await trainingRoomId(' 카드  운영팀 '),await trainingRoomId('카드 운영팀'));
 assert.equal(await trainingRoomId('카드 운영팀'.normalize('NFD')),await trainingRoomId('카드 운영팀'));
 assert.equal(await trainingRoomId(' TEAM '),'city-team');
 assert.notEqual(await trainingRoomId('카드 운영팀'),await trainingRoomId('카드 분석팀'));
 assert.match(await trainingRoomId('카드 운영팀'),/^city-[a-f0-9]{24}$/);
 for(const name of ['','   ','a/b','<script>','a'.repeat(28)])await assert.rejects(()=>trainingRoomId(name));
});


test('peace room namespace stays isolated and long English names fit the server limit',async()=>{
 assert.equal(await peaceRoomId(' 오늘도  무사히 '),await peaceRoomId('오늘도 무사히'.normalize('NFD')));
 assert.equal(await peaceRoomId(' TEAM '),'peace-team');
 assert.notEqual(await peaceRoomId('team'),await trainingRoomId('team'));
 assert.match(await peaceRoomId('a'.repeat(27)),/^peace-[a-f0-9]{24}$/);
 assert.ok((await peaceRoomId('a'.repeat(26))).length<=32);
 for(const name of ['','a/b','a'.repeat(28)])await assert.rejects(()=>peaceRoomId(name));
});
