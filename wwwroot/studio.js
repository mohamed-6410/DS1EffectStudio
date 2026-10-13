import * as THREE from 'three';

import {OrbitControls} from './vendor/OrbitControls.js';

import {DDSLoader} from './vendor/DDSLoader.js';

import {compileEffect,curve,random,spawnTimes} from './engine.js';

import {createEditor} from './editor.js';

import {createTimeline} from './multi-timeline.js';

import {createSoundEditor} from './sound-editor.js';

const $=id=>document.getElementById(id), viewport=$('viewport');

const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#10151c');viewport.appendChild(renderer.domElement);

const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,0.005,10000);camera.position.set(2.5,1.8,3.2);

const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.2,0);controls.enableDamping=true;

const grid=new THREE.GridHelper(10,40,0x57616d,0x26303b);scene.add(grid);

const axes=new THREE.AxesHelper(.3);scene.add(axes);

const group=new THREE.Group();scene.add(group);

const light=new THREE.HemisphereLight(0xd7e5ff,0x414141,2);scene.add(light);

const plane=new THREE.PlaneGeometry(1,1),ddsLoader=new DDSLoader();

const textureCache=new Map(),modelCache=new Map();let catalog,archive,current,compiled={layers:[],warnings:[]},pools=[],time=1,playing=true,last=performance.now(),assetMode=false,resources,generation=0,wire=false,seed=12345;

let extraWarnings=new Set();

const white=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);white.needsUpdate=true;

const draftCache=new Map();

const names={90000:'Bonfire',20085:'Fireball casting',80000:'Fog gate'};

const assetName=id=>'s'+String(id).padStart(5,'0');

const qs=v=>new URLSearchParams(v).toString();

async function api(path,args={}){const r=await fetch('/api/'+path+'?'+qs(args));if(!r.ok){let e=await r.json();throw Error(e.error??r.statusText);}return r.json();}

function note(message){$('status').textContent=message;}

function resize(){const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}

new ResizeObserver(resize).observe(viewport);

function disposeGroup(){group.traverse(o=>{if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose());}});group.clear();pools=[];}

async function texture(name,a=archive){

  const key=a+'|'+name;if(!textureCache.has(key))textureCache.set(key,(async()=>{

    const r=await fetch('/api/texture?'+qs({archive:a,name}));if(!r.ok)throw Error('Missing texture '+name);

    const buffer=await r.arrayBuffer(),data=ddsLoader.parse(buffer,true);

    if(!data.width)throw Error('Unsupported DDS '+name);

    const t=new THREE.CompressedTexture(data.mipmaps,data.width,data.height,data.format);t.needsUpdate=true;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=data.mipmapCount>1?THREE.LinearMipmapLinearFilter:THREE.LinearFilter;t.flipY=false;

    return t;

  })());return textureCache.get(key);

}

function setBlend(m,mode){m.blending=THREE.CustomBlending;m.blendEquation=THREE.AddEquation;m.blendSrc=THREE.SrcAlphaFactor;m.blendDst=THREE.OneMinusSrcAlphaFactor;

  if([0,4].includes(mode))m.blendDst=THREE.OneFactor;

  if(mode===3){m.blendSrc=THREE.DstColorFactor;m.blendDst=THREE.ZeroFactor;}

  if(mode===5){m.blendEquation=THREE.ReverseSubtractEquation;m.blendDst=THREE.OneFactor;}

  if(mode===7){m.blendSrc=THREE.OneFactor;m.blendDst=THREE.OneMinusSrcColorFactor;}

}

function material(maps,blend){const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{map1:{value:maps[0]??white},map2:{value:maps[1]??white},map3:{value:maps[2]??white},multi:{value:maps.length>1?1:0},tint:{value:new THREE.Vector4(1,1,1,1)},atlas:{value:new THREE.Vector4(1,1,0,0)},shift1:{value:new THREE.Vector2()},shift2:{value:new THREE.Vector2()},shift3:{value:new THREE.Vector2()},exposure:{value:1}},vertexShader:`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`uniform sampler2D map1,map2,map3; uniform float multi,exposure;uniform vec4 tint,atlas;uniform vec2 shift1,shift2,shift3; varying vec2 vUv;void main(){vec2 uv=vUv*atlas.xy+atlas.zw;vec4 c=texture2D(map1,uv+shift1);if(multi>0.5){vec4 b=texture2D(map2,vUv+shift2);vec4 d=texture2D(map3,vUv+shift3);c*=b*d;}gl_FragColor=vec4(c.rgb*tint.rgb*exposure,c.a*tint.a);if(gl_FragColor.a<0.001)discard; #include <colorspace_fragment> }`.replace(' #include','\n#include')});setBlend(m,blend);return m;}

async function model(name,a=archive){const key=a+'|'+name;if(!modelCache.has(key))modelCache.set(key,(async()=>{

  const f=await api('model',{archive:a,name}),root=new THREE.Group();

  for(const mesh of f.meshes){const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute(mesh.positions,3));geom.setAttribute('normal',new THREE.Float32BufferAttribute(mesh.normals,3));geom.setAttribute('uv',new THREE.Float32BufferAttribute(mesh.uvs,2));geom.setIndex(mesh.indices);geom.computeBoundingSphere();

    const mat=f.materials[mesh.material],tex=mat?.textures.find(t=>/diffuse|albedo|g_Diffuse/i.test(t.type))??mat?.textures[0];let map=white;

    if(tex?.path){let n=tex.path.replaceAll('\\','/').split('/').at(-1).replace(/\.[^.]*$/,'');try{map=await texture(n,a);}catch(e){extraWarnings.add(e.message);}}

    const m=material([map],2);m.userData.surface={cullBackfaces:mesh.cullBackfaces??true,alphaMaterial:/_Alp/i.test(mat?.mtd??"" )};meshSurface(m);const o=new THREE.Mesh(geom,m);o.userData.materialInfo=mat;root.add(o);

  }return root;

})());return modelCache.get(key);}

function copyModel(source){const copy=source.clone(true);copy.traverse(o=>{if(o.material)o.material=o.material.clone();});return copy;}

function meshSurface(m,alpha=1,blend=2){

  const surface=m.userData.surface;if(!surface)return;

  const mode=$('faces').value;

  const side=mode==='front'?THREE.FrontSide:mode==='back'?THREE.BackSide:mode==='both'?THREE.DoubleSide:(surface.cullBackfaces?THREE.FrontSide:THREE.DoubleSide);

  // Model blend 0 follows its base material; billboards retain their particle blending.

  const modelBlend=blend===0?2:blend;

  const opaque=!surface.alphaMaterial&&[2,6].includes(modelBlend)&&alpha>=.999;

  if(m.side!==side||m.transparent===opaque)m.needsUpdate=true;

  m.side=side;m.transparent=!opaque;m.depthTest=true;m.depthWrite=opaque;

  if(opaque)m.blending=THREE.NoBlending;else setBlend(m,modelBlend);

}

async function loadEffect(id,draft=null,preserve=false){const g=++generation;const previousLayers=new Map(pools.map(p=>[p.layer.key,p.layer.enabled]));const nextPools=[];assetMode=false;extraWarnings=new Set();$('loading').hidden=preserve;$('loading').textContent='Decoding FFX and loading resources…';

  if(!draft&&current){const saved=editor.snapshot();if(saved)draftCache.set(current.archive+'|'+current.id,saved);}

  try{let fx=draft??await api('effect',{archive,id});if(g!==generation)return;if(!draft){const saved=draftCache.get(fx.archive+'|'+fx.id);if(saved&&saved.original.sha256===fx.sha256){fx=saved.state;editor.restore(saved);}else editor.reset(fx);}current=fx;compiled=compileEffect(fx);timelineEditor.update(current,compiled);soundEditor.update(compiled);updateSlots();

    $('effectTitle').textContent=`f${String(id).padStart(7,'0')}${names[id]?' · '+names[id]:''}`;$('effectMeta').textContent=`${fx.bytes.toLocaleString()} bytes · ${fx.states} states · ${fx.transitions} transitions · PTDE 32-bit`;

    for(const layer of compiled.layers){const d=layer.data;let maps=[],template;

      if(d.ModelID!=null){try{template=await model(assetName(d.ModelID));}catch(e){extraWarnings.add(e.message);}}

      else {for(const n of [d.TextureID??d.TextureID1,d.TextureID2,d.TextureID3].filter(x=>x!=null&&x>=0)){try{maps.push(await texture(assetName(n)));}catch(e){extraWarnings.add(e.message);maps.push(white);}}}

      if(g!==generation)return;

      if(d.ModelID!=null&&!template)continue;

      if(preserve)layer.enabled=previousLayers.get(layer.key)??true;nextPools.push({layer,maps,template,instances:[]});

    }

    disposeGroup();pools=nextPools;
    if(!preserve)time=compiled.layers.length?Math.min(...compiled.layers.map(l=>l.schedule.delay+Math.min(.2,(l.data.Duration>0?l.data.Duration:1)*.3))):0;

    renderLayers();buildLayers();timelineEditor.update(current,compiled);soundEditor.update(compiled);updateSlots();highlight();$('raw').textContent=JSON.stringify(current,null,2);$('loading').hidden=true;

    const issues=[...compiled.warnings,...extraWarnings];note(`${pools.length} render layers · ${issues.length?issues.join(' | '):'Textures, models and parameter curves loaded. Playback is reconstructed.'}`);

    if(!preserve)frame();window.chrome?.webview?.postMessage({type:'studio-ready',effect:$('effectTitle').textContent,layers:pools.length});window.studioDebug={get state(){return {id:current?.id,time,layers:pools.length,particles:pools.reduce((s,p)=>s+p.instances.filter(i=>i.visible).length,0),warnings:[...compiled.warnings,...extraWarnings],assetMode};},selectEffect:loadEffect,inspectAsset,compileEffect};

  }catch(e){if(g===generation){$('loading').textContent=e.message;note(e.message);}}

}

function buildLayers(){const list=$('layerList');list.replaceChildren();pools.forEach((p,i)=>{const d=p.layer.data,el=document.createElement('div');el.className='layer';const row=document.createElement('div');row.className='row';const check=document.createElement('input');check.type='checkbox';check.checked=p.layer.enabled!==false;check.onchange=()=>{p.layer.enabled=check.checked;renderLayers();};const btn=document.createElement('button');btn.textContent=`Group ${p.layer.groupNumber} · ${i+1}. ${d.ModelID!=null?'3D mesh':d.Type===40?'Trail preview':'Billboard'} · action ${d.Type}`;const pre=document.createElement('pre');pre.hidden=true;pre.textContent=JSON.stringify({data:d,schedule:p.layer.schedule,emitter:p.layer.emitter,movement:p.layer.movement},null,2);btn.onclick=()=>pre.hidden=!pre.hidden;row.append(check,btn);const sm=document.createElement('small');sm.textContent=`${d.ModelID!=null?'model '+assetName(d.ModelID):'texture '+assetName(d.TextureID??d.TextureID1)} · function ${p.layer.function}`;el.append(row,sm,pre);list.append(el);});if(!pools.length)list.textContent='No supported render actions in this initial state. Open Assets to view the resources.';}

function transformPoint(layer,pos,t,particleSeed){const q=new THREE.Quaternion();

  // The packed transform modifier carries the authoring translation and quaternion.

  for(let i=layer.transforms.length-1;i>=0;i--){const tr=layer.transforms[i],ns=tr.nodes,mod=tr.modifier;

    if(tr.type===35&&mod){if(mod.Unk1&256){q.set(mod.Unk8??0,mod.Unk9??0,mod.Unk10??0,mod.Unk11??1).normalize();pos.applyQuaternion(q);}if(mod.Unk1&1)pos.add(new THREE.Vector3(mod.OffsetX??0,mod.OffsetY??0,mod.Unk6??0));}

    if(tr.type===1){let x=curve(ns[1],t,particleSeed,0)*rangeNode(ns[0],particleSeed),y=curve(ns[3],t,particleSeed,0)*rangeNode(ns[2],particleSeed+7);pos.add(new THREE.Vector3(x,-y,curve(ns[6],t,particleSeed,0)));}

  }return pos;

}

function rangeNode(n,s){return n?.X!=null?n.X+(n.Y-n.X)*random(s,16):1;}

function particlePosition(layer,age,s){const e=layer.emitter,m=layer.movement,ev=(name,f=0)=>curve(e?.[name],0,s,f,e?.Resources),pos=new THREE.Vector3(),vel=new THREE.Vector3(),r1=random(s,1),r2=random(s,2),r3=random(s,5);

  const theta=r1*Math.PI*2;

  if(e){if(e.Type===31){const radius=ev('EmitterRadius'),y=2*r2-1,rr=Math.sqrt(1-y*y);pos.set(rr*Math.cos(theta),y,rr*Math.sin(theta)).multiplyScalar(radius*Math.cbrt(r3));}

    if(e.Type===30){const radius=ev('EmitterRadius')*Math.sqrt(r2);pos.set(Math.cos(theta)*radius,0,Math.sin(theta)*radius);}

    if(e.Type===29)pos.set((r1-.5)*ev('EmitterSize'),0,(r2-.5)*ev('EmitterSize'));

    if(e.Type===32)pos.set((r1-.5)*ev('EmitterSizeX'),(r2-.5)*ev('EmitterSizeY'),(r3-.5)*ev('EmitterSizeZ'));

    const speed=ev('EmitterSpeed'),angle=ev('EmitterDegree')*Math.PI/180,spread=ev('EmitterSpread');

    vel.set(Math.cos(theta)*Math.sin(angle),Math.cos(angle),Math.sin(theta)*Math.sin(angle)).multiplyScalar(speed+spread*(r2-.5));pos.addScaledVector(vel,age);

  }

  if(m){pos.y-=.5*curve(m.Gravity,age,s,0,m.Resources)*age*age;if(m.Type===84){const radius=curve(m.WobblingRadius,age,s,0,m.Resources);const speed=curve(m.WobblingSpeed,age,s,0,m.Resources);pos.x+=Math.sin(age*speed+r1*6.28)*radius;pos.z+=Math.cos(age*speed+r2*6.28)*radius;}}

  return transformPoint(layer,pos,age,s);

}

function renderLayers(){if(assetMode)return;let total=0;

  const exposure=+$('exposure').value;

  pools.forEach((p,li)=>{const l=p.layer,d=l.data,births=l.enabled?spawnTimes(l,time,seed+li*97):[];

    while(p.instances.length<births.length){let o=p.template?copyModel(p.template):new THREE.Mesh(plane,material(p.maps,d.BlendMode));group.add(o);p.instances.push(o);}

    p.instances.forEach((o,j)=>{o.visible=j<births.length;if(!o.visible)return;total++;const b=births[j],s=seed+li*701+b.index*31,age=time-b.birth,ct=age/(d.DurationMult||1),cv=(k,f=1,at=ct)=>curve(d[k],at,s,f,d.Resources);

      o.position.copy(particlePosition(l,age,s));

      const sx=cv('Scale1X',cv('ScaleX',cv('Scale',1),b.birth),b.birth)*cv('Scale2X',cv('ScaleMult')),sy=cv('Scale1Y',cv('ScaleY',cv('Scale1X',cv('ScaleX',cv('Scale',1),b.birth),b.birth),b.birth),b.birth)*cv('Scale2Y',cv('Scale2X',cv('ScaleMult'))),sz=cv('Scale1Z',1,b.birth)*cv('Scale2Z');

      o.scale.set(Math.abs(sx),Math.abs(sy),Math.abs(sz));

      const orient=d.OrientationMode??1;o.quaternion.identity();if(!p.template){if(orient===1)o.quaternion.copy(camera.quaternion);if(orient===2)o.rotation.x=-Math.PI/2;if(orient===3)o.rotation.x=0;if(orient===4){const direction=new THREE.Vector3().subVectors(camera.position,o.position);o.rotation.y=Math.atan2(direction.x,direction.z);}if(orient===5)o.rotation.y=Math.PI/2;}

      const rot=new THREE.Quaternion().setFromEuler(new THREE.Euler(cv('RotX',0,0)+cv('RotSpeedX',0,0)*age,cv('RotY',0,0)+cv('RotSpeedY',0,0)*age,cv('RotZ',0,0)+cv('RotSpeedZ',0,0)*age));o.quaternion.multiply(rot);

      const tint=new THREE.Vector4(...['R','G','B','A'].map(k=>cv('Color1'+k,cv('Color'+k,1,b.birth),b.birth)*cv('Color2'+k,1)));

      const row=Math.max(1,d.AnimFrameSliceCountPerRow||1),count=Math.max(1,d.AnimFrameTotalCount||1);let frame=Math.floor(cv('AnimFrameInitial',0,b.birth)+cv('AnimFrameTimeline',0));frame=((frame%count)+count)%count;

      o.traverse(mesh=>{if(!mesh.material?.uniforms)return;const m=mesh.material;m.wireframe=wire;meshSurface(m,tint.w,d.BlendMode);const u=m.uniforms;u.tint.value.copy(tint);u.exposure.value=exposure;u.atlas.value.set(1/row,1/row,(frame%row)/row,1-(Math.floor(frame/row)+1)/row);

        u.shift1.value.set(cv('Tex1UVOffsetX',cv('UVOffsetX',cv('UVShiftX',0)))+cv('Tex1UVScrollX',cv('UVScrollX',0))*age,cv('Tex1UVOffsetY',cv('UVOffsetY',cv('UVShiftY',0)))+cv('Tex1UVScrollY',cv('UVScrollY',0))*age);

        u.shift2.value.set(cv('Tex2UVOffsetX',0)+cv('Tex2UVScrollX',0)*age,cv('Tex2UVOffsetY',0)+cv('Tex2UVScrollY',0)*age);u.shift3.value.set(cv('Tex3UVOffsetX',0)+cv('Tex3UVScrollX',0)*age,cv('Tex3UVOffsetY',0)+cv('Tex3UVScrollY',0)*age);

      });

    });

  });$('metrics').textContent=`${total} instances · ${pools.length} layers`;

}

function frame(){group.updateMatrixWorld(true);const box=new THREE.Box3();group.traverse(o=>{if(o.isMesh&&o.visible)box.expandByObject(o);});if(box.isEmpty()){controls.target.set(0,0,0);camera.position.set(2,1.5,3);}else{const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()).length();controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(1,.7,1.6).normalize().multiplyScalar(Math.max(.25,size*1.7)));}controls.update();}

function highlight(){document.querySelectorAll('.effect').forEach(el=>el.classList.toggle('selected',+el.dataset.id===current?.id));}

function buildEffects(){const q=$('search').value.toLowerCase(),a=catalog.archives.find(a=>a.name===archive);const es=a.effects.filter(e=>`${e.id} ${e.name} ${names[e.id]??''}`.toLowerCase().includes(q));$('count').textContent=`${es.length.toLocaleString()} effects`;$('effects').replaceChildren();const fragment=document.createDocumentFragment();es.forEach(e=>{const el=document.createElement('button');el.className='effect';el.dataset.id=e.id;const span=document.createElement('span');span.textContent=e.name;const sm=document.createElement('small');sm.textContent=names[e.id]??'Effect '+e.id;span.append(sm);const em=document.createElement('em');em.textContent=(e.bytes/1024).toFixed(1)+'k';el.append(span,em);el.onclick=()=>loadEffect(e.id);fragment.append(el);});$('effects').append(fragment);highlight();}

async function loadArchive(){archive=$('archive').value;generation++;buildEffects();resources=await api('resources',{archive});buildAssets();const a=catalog.archives.find(a=>a.name===archive);await loadEffect(a.effects.find(e=>e.id===90000)?.id??a.effects[0].id);}

function buildAssets(){if(!resources)return;const type=$('assetType').value,q=$('assetSearch').value.toLowerCase();$('assetList').replaceChildren();resources[type].filter(n=>n.includes(q)).forEach(n=>{const b=document.createElement('button');b.textContent=n;b.onclick=()=>{chosenAsset={key:n,id:Number(n.slice(1)),kind:type};$('importId').value=chosenAsset.id;updateSlots();if(type==='models')$('quickModel').value=chosenAsset.id;inspectAsset(type,n);};$('assetList').append(b);});}

async function inspectAsset(type,name){const g=++generation;assetMode=true;$('loading').hidden=false;$('loading').textContent='Loading '+name;try{let o;if(type==='models')o=copyModel(await model(name));else{const t=await texture(name);o=new THREE.Mesh(plane,new THREE.MeshBasicMaterial({map:t,transparent:true,side:THREE.DoubleSide}));o.scale.set(2,2*t.image.height/t.image.width,1);}if(g!==generation)return;disposeGroup();group.add(o);$('effectTitle').textContent=name;$('effectMeta').textContent=type==='models'?'Original FLVER mesh · material textures':'Original TPF / DDS texture';frame();$('loading').hidden=true;note('Resource inspection · Return to effect to resume playback.');window.studioDebug.asset=name;}catch(e){$('loading').textContent=e.message;note(e.message);}}

function save(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause':'Play';};$('restart').onclick=()=>{time=0;renderLayers();};$('timeline').oninput=()=>{time=+$('timeline').value;renderLayers();};$('duration').onchange=()=>{$('timeline').max=Math.max(1,+$('duration').value);};$('fit').onclick=frame;$('wire').onclick=()=>{wire=!wire;$('wire').classList.toggle('active',wire);group.traverse(o=>{if(o.material)o.material.wireframe=wire;});};$('grid').onclick=()=>{grid.visible=!grid.visible;axes.visible=grid.visible;};$('background').oninput=()=>renderer.setClearColor($('background').value);$('seed').onchange=()=>{seed=+$('seed').value;renderLayers();};$('exposure').oninput=renderLayers;

$('search').oninput=buildEffects;$('archive').onchange=loadArchive;$('assetSearch').oninput=buildAssets;$('assetType').onchange=buildAssets;$('returnEffect').onclick=()=>loadEffect(current.id,current,true);

$('faces').onchange=()=>{if(assetMode)group.traverse(o=>{if(o.material)meshSurface(o.material);});else renderLayers();};

$('capture').onclick=()=>{renderer.render(scene,camera);renderer.domElement.toBlob(b=>save(b,`DS1-${current?.id??'resource'}.png`));};$('export').onclick=()=>save(new Blob([JSON.stringify(current,null,2)],{type:'application/json'}),`f${String(current.id).padStart(7,'0')}.json`);

$('graph').onclick=()=>{$('raw').textContent=Object.entries(current.objects).filter(([k,v])=>['EffectCreateNode133','EffectCallNode','ActionCallNode','FXState','FXTransition'].includes(v.kind)).map(([k,v])=>`${k}  ${v.kind} ${v.EffectID??v.ActionType??''}\n${JSON.stringify(v,null,2)}`).join('\n\n');};

document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.panel').forEach(p=>p.hidden=p.id!==b.dataset.tab);});

document.querySelectorAll('.quick button').forEach(b=>b.onclick=async()=>{if(archive!==catalog.common){$('archive').value=catalog.common;archive=catalog.common;resources=await api('resources',{archive});buildAssets();buildEffects();}loadEffect(+b.dataset.id);});

window.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('play').click();}if(e.key==='f'&&document.activeElement===document.body)frame();});

function animate(now){requestAnimationFrame(animate);const dt=Math.min(.05,(now-last)/1000);last=now;if(playing&&!assetMode){time+=dt*+$('speed').value;const max=+$('timeline').max;if(time>max){if($('loop').checked)time=0;else{time=max;playing=false;$('play').textContent='Play';}}}controls.update();renderLayers();timelineEditor.playhead(time);soundEditor.tick(time,playing&&!assetMode);$('timeline').value=time;$('time').textContent=time.toFixed(2)+' s';renderer.render(scene,camera);}

requestAnimationFrame(animate);

const editor=createEditor({preview:fx=>loadEffect(fx.id,fx,true),download:save,status:note});

const timelineEditor=createTimeline({editor,status:note,onSelect:updateSlots,seek:t=>{time=Math.min(+$('timeline').max,t);renderLayers();}});

const soundEditor=createSoundEditor({editor,layer:()=>timelineEditor.selectedLayer(),status:note});

let chosenAsset;

function updateSlots(){const ls=timelineEditor.selectedLayers(),keys=new Set(ls.flatMap(l=>Object.keys(l.data).filter(k=>/^TextureID\d?$|^ModelID$/.test(k))));$('assetSlot').replaceChildren();for(const k of keys){const o=document.createElement('option');o.value=k;o.textContent=k;$('assetSlot').append(o);}const previous=$('quickModel').value;$('quickModel').replaceChildren();for(const name of resources?.models??[]){const o=document.createElement('option');o.value=Number(name.slice(1));o.textContent=name;$('quickModel').append(o);}const meshes=ls.filter(l=>l.data.ModelID!=null),currentId=String(meshes[0]?.data.ModelID??'');if([...(resources?.models??[])].some(n=>String(Number(n.slice(1)))===previous))$('quickModel').value=previous;else if(meshes.length)$('quickModel').value=currentId;$('assignModel').disabled=!meshes.length||!$('quickModel').value;$('modelAssignHint').textContent=meshes.length?`Current model: ${meshes.map(l=>assetName(l.data.ModelID)).filter((v,i,a)=>a.indexOf(v)===i).join(", ")}. Assign to ${meshes.length} selected mesh layer(s).`:'Select model layers (action 108). Billboard-only effects cannot receive a FLVER model.';}
$('assignModel').onclick=()=>{const id=Number($('quickModel').value),ls=timelineEditor.selectedLayers().filter(l=>l.data.ModelID!=null);if(!ls.length||!Number.isInteger(id))return;editor.change(fx=>ls.forEach(l=>fx.objects[l.target].ModelID=id));};
$('quickModel').onchange=()=>{$('assignModel').disabled=!timelineEditor.selectedLayers().some(l=>l.data.ModelID!=null)||!$('quickModel').value;};

$('importAsset').onclick=()=>$('nativeAsset').click();

$('nativeAsset').onchange=async()=>{try{const file=$('nativeAsset').files[0];if(!file)return;if(file.size>24*1024*1024)throw Error('Asset must be under 24 MB');const id=+$('importId').value;if(!Number.isInteger(id)||id<0||id>99999)throw Error('Resource ID must be 0–99999');const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));const r=await fetch('/api/import-asset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({archive,id,name:file.name,data:btoa(binary)})});if(!r.ok)throw Error((await r.json()).error);chosenAsset=await r.json();textureCache.clear();modelCache.clear();resources=await api('resources',{archive});buildAssets();updateSlots();if(chosenAsset.kind==='models')$('quickModel').value=chosenAsset.id;$('importState').textContent=`${chosenAsset.key} imported. Assign it to a layer or inspect it. Export the archive to save it.`;await loadEffect(current.id,current,true);note('Imported '+chosenAsset.key+' into the session. Original game files are unchanged.');}catch(e){note(e.message);}finally{$('nativeAsset').value='';}};

$('assignAsset').onclick=()=>{const slot=$('assetSlot').value,ls=timelineEditor.selectedLayers().filter(l=>typeof l.data[slot]==='number');if(!chosenAsset||!ls.length||!slot){note('Import or select an asset, then select compatible timeline layers.');return;}if((slot==='ModelID')!==(chosenAsset.kind==='models')){note('Choose a model for ModelID or a texture for a texture slot.');return;}editor.change(fx=>ls.forEach(l=>fx.objects[l.target][slot]=chosenAsset.id));};

$('exportArchive').onclick=async()=>{try{note('Writing and validating archive…');const patch=editor.patch();const r=await fetch('/api/export-archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});if(!r.ok)throw Error((await r.json()).error);save(await r.blob(),patch.archive);note('Validated archive exported with this FFX and imported assets. Game files unchanged.');}catch(e){note(e.message);}};

try{catalog=await api('catalog');$('libraryStats').textContent=`${catalog.archives.length} archives · ${catalog.archives.reduce((s,a)=>s+a.effects.length,0).toLocaleString()} effects`;for(const a of catalog.archives){const o=document.createElement('option');o.value=a.name;o.textContent=a.name.replace('FRPG_SfxBnd_','').replace('.ffxbnd','');$('archive').append(o);}$('archive').value=catalog.common;await loadArchive();}catch(e){$('loading').textContent=e.message;note(e.message);}









