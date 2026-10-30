import {test,expect} from '@playwright/test';
import fixture from './fixtures/twin-lab.json';
import {workflow,visualSnapshot} from '../components/war-room/workflow';
import type {RoomState} from '../components/war-room/types';
test('explicit fault location wins over an AI candidate and duplicate stage events do not restart motion',()=>{
 const state={room:'test',run:fixture.compared,busy:false} as unknown as RoomState;
 expect(workflow(state).target).toBe('db-primary');
 const incident={stage:'RECOVERY',status:'RECOVERING',node:'mq',version:2,eventId:20,approved:true,completedSteps:['RECOVERY'],totalSteps:6,aiSource:'DEMO'};
 expect(workflow({...state,incident}).key).toBe(workflow({...state,incident:{...incident,eventId:21}}).key);
 expect(workflow({...state,run:{...state.run,faultSnapshot:{...state.run.current,faults:[{target:'mq',type:'QUEUE_FAILURE'}]}},incident:{...incident,node:'db-primary'}}).fault).toBe('DATABASE');
});
test('approved partial and missing results never claim complete; visualization does not mutate server data',()=>{
 const state={room:'test',run:{...fixture.compared,status:'APPROVED',selectedStrategy:'protect'},busy:false} as unknown as RoomState;
 expect(workflow(state).stage).toBe('FAILED');
 expect(workflow({...state,run:{...state.run,results:undefined}}).stage).toBe('FAILED');
 const original=JSON.stringify(state.run.current),flow={...workflow(state),source:'연결 장애 · 서버 동기화',stage:'COMPLETE' as const};
 expect(visualSnapshot(state.run.current,flow,false).nodes.every(n=>n.status==='HEALTHY')).toBe(true);
 expect(JSON.stringify(state.run.current)).toBe(original);
});
