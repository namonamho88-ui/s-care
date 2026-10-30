import {test,expect} from '@playwright/test';
import {PerspectiveCamera,Vector3} from 'three';
import {responseFraming} from '../components/war-room/camera-framing';

test('response camera fits the full floor and perimeter at phone and desktop aspect ratios',()=>{
 for(const aspect of [.45,.8,1,1.8,3.2])for(const floor of [1,2]){
  const frame=responseFraming(floor,aspect,48),camera=new PerspectiveCamera(48,aspect,.1,180),base=(floor-1)*5.5;
  camera.position.copy(frame.position);camera.lookAt(frame.target);camera.updateMatrixWorld();
  for(const x of [-10.3,10.3])for(const y of [base-.4,base+4.7])for(const z of [-7.3,7.3]){
   const p=new Vector3(x,y,z).project(camera);expect(Math.abs(p.x)).toBeLessThan(.9);expect(Math.abs(p.y)).toBeLessThan(.9);expect(p.z).toBeGreaterThan(-1);expect(p.z).toBeLessThan(1);
  }
 }
});
