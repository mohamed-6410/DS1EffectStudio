import {compileEffect} from './engine.js';
const clone=v=>JSON.parse(JSON.stringify(v));

const protectedNames=new Set(['kind','Type','DS1RData','Resources']);

const graphFields={TickNode:['Tick'],Tick2Node:['Tick1','Tick2'],IntNode:['Value'],Int2Node:['X','Y'],SoundIDNode68:['SoundID'],SoundIDNode69:['SoundID'],FXModifier2_SetLifetime:['Lifetime','Unk2','Unk3','Unk4'],FXModifier6_SetLifetimeB:['Unk1']};

export function exportPatch(original,draft){const edits=[],curves=[],constants=[];

  if(draft.id!==original.id||draft.archive!==original.archive||draft.sha256!==original.sha256||JSON.stringify(draft.root)!==JSON.stringify(original.root)||Object.keys(draft.objects).length!==Object.keys(original.objects).length)throw Error('Draft identity or graph structure changed.');

  for(const [key,value]of Object.entries(original.objects))if(!value.kind?.includes('ActionData')&&JSON.stringify(value)!==JSON.stringify(draft.objects[key])){const after=draft.objects[key];for(const field of Object.keys(value))if(JSON.stringify(value[field])!==JSON.stringify(after?.[field])){if(!(graphFields[value.kind]??[]).includes(field)||!Number.isFinite(after[field]))throw Error('Unsupported graph change: '+field);edits.push({target:key,path:[field],value:after[field]});}}

  for(const [target,before]of Object.entries(original.objects)){if(!before.kind?.includes('ActionData'))continue;const after=draft.objects[target];if(!after||after.kind!==before.kind)throw Error('Action types cannot be changed in this editor.');

    function compare(a,b,path){if(typeof a==='number'){if(a!==b){if(!Number.isFinite(b))throw Error('Parameters must be finite');edits.push({target,path,value:b});}return;}

      if(a&&typeof a==='object'&&!Array.isArray(a)){if(a.kind!==b?.kind){if(path.length===1&&['RotX','RotY','RotZ','Scale1X','Scale1Y','Scale1Z','ScaleX','ScaleY','ScaleZ','Scale'].includes(path[0])&&b?.kind==='ConstFloat'&&Number.isFinite(b.Value)){constants.push({target,field:path[0],value:b.Value});return;}throw Error('Unsupported curve type change.');}for(const [k,v]of Object.entries(a)){if(protectedNames.has(k)){if(JSON.stringify(v)!==JSON.stringify(b?.[k]))throw Error('Protected field changed: '+k);continue;}if(k==='Ticks'&&Array.isArray(v)){if(JSON.stringify(v)!==JSON.stringify(b[k]))curves.push({target,field:path[0],ticks:b[k].map(t=>({time:t.Time,value:t.Value}))});}else compare(v,b?.[k],[...path,k]);}}

    }compare(before,after,[]);

  }return {archive:original.archive,id:original.id,sha256:original.sha256,edits,curves,sounds:draft.pendingSounds??[],constants};

}

export function createEditor({preview,download,status}){

  const $=id=>document.getElementById(id);let original,state,history=[],cursor=0,selected;

  function update(){if(!state)return;const groupLabels=new Map();for(const g of compileEffect(state).groups){const call=state.objects[g.target],container=state.objects[call?.Container?.ref];for(const ref of container?.FXNodes??[]){const action=state.objects[ref.ref],target=state.objects[action?.Container?.ref]?.ActionData?.ref;if(!target)continue;const nums=groupLabels.get(target)??new Set();nums.add(g.number);groupLabels.set(target,nums);}}const targets=Object.entries(state.objects).filter(([k,v])=>v.kind?.includes('ActionData'));

    $('editLayer').replaceChildren(...targets.map(([k,v])=>{const o=document.createElement('option');o.value=k;o.textContent=`${groupLabels.has(k)?'Group '+[...groupLabels.get(k)].join('/')+' · ':''}${v.Type} · ${v.kind.replace('ActionData','')} · ${k.split('_').at(-1)}`;return o;}));

    if(!targets.some(([k])=>k===selected))selected=targets[0]?.[0];$('editLayer').value=selected??'';

    $('undoEdit').disabled=cursor===0;$('redoEdit').disabled=cursor===history.length-1;

    const patch=exportPatch(original,state);$('editState').textContent=`${patch.edits.length+patch.constants.length} parameter changes · ${patch.curves.length} edited curves · ${patch.sounds.length} inserted sounds`;

    form();

  }

  function change(fn){const next=clone(state);try{fn(next);exportPatch(original,next);state=next;history=history.slice(0,cursor+1);history.push(clone(state));if(history.length>60)history.shift();cursor=history.length-1;update();preview(clone(state));return true;}catch(e){status(e.message);update();return false;}}

  function commit(fn){return change(next=>fn(next.objects[selected]));}

  function numeric(parent,label,value,fn,integer=false){const row=document.createElement('div');row.className='editfield';const l=document.createElement('label');l.textContent=label;const input=document.createElement('input');input.type='number';input.step=integer?'1':'any';input.value=value;input.setAttribute('aria-label',label);input.onchange=()=>{const n=Number(input.value);if(!Number.isFinite(n)||input.value===''||(integer&&!Number.isInteger(n))){status('Enter a valid '+(integer?'integer':'number'));input.value=value;return;}commit(d=>fn(d,n));};row.append(l,input);parent.append(row);}

  function form(){const parent=$('editForm'),expanded=new Set([...parent.querySelectorAll('details[open]')].map(el=>el.dataset.field));parent.replaceChildren();const d=state.objects[selected];if(!d){parent.textContent='Select an effect containing action data.';return;}

    const prefix=['Color1','Color'].find(p=>['R','G','B'].every(k=>d[p+k]?.kind==='ConstFloat'));

    if(prefix){const row=document.createElement('div');row.className='editfield';const lab=document.createElement('label');lab.textContent='Color tint';const color=document.createElement('input');color.type='color';color.value='#'+['R','G','B'].map(k=>Math.round(Math.max(0,Math.min(1,d[prefix+k].Value))*255).toString(16).padStart(2,'0')).join('');color.oninput=()=>{};color.onchange=()=>commit(n=>['R','G','B'].forEach((k,i)=>n[prefix+k].Value=parseInt(color.value.slice(1+i*2,3+i*2),16)/255));row.append(lab,color);parent.append(row);}

    for(const [key,value]of Object.entries(d)){if(protectedNames.has(key)||!$('advancedEdit').checked&&/^Unk|^DS1R/.test(key))continue;

      if(typeof value==='number'){numeric(parent,key,value,(n,v)=>n[key]=v,/ID\d?$|Mode$|Count|Bool|Orientation/.test(key));continue;}

      if(!value?.kind||value.kind==='Empty')continue;

      const details=document.createElement('details');details.className='curveEdit';details.dataset.field=key;details.open=expanded.has(key);const sum=document.createElement('summary');sum.textContent=key+' · '+value.kind;details.append(sum);parent.append(details);

      for(const k of ['Value','Base','Min','Max'])if(typeof value[k]==='number')numeric(details,k,value[k],(n,v)=>n[key][k]=v);

      if(value.Ticks?.every(t=>typeof t.Value==='number')){

        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 260 65');svg.classList.add('curvePlot');const ts=value.Ticks,min=Math.min(...ts.map(t=>t.Value)),max=Math.max(...ts.map(t=>t.Value)),end=Math.max(.001,ts.at(-1).Time-ts[0].Time);const line=document.createElementNS(svg.namespaceURI,'polyline');line.setAttribute('fill','none');line.setAttribute('stroke','#dec28b');line.setAttribute('stroke-width','2');line.setAttribute('points',ts.map(t=>`${5+250*(t.Time-ts[0].Time)/end},${60-55*(t.Value-min)/(max-min||1)}`).join(' '));svg.append(line);details.append(svg);

        ts.forEach((tick,i)=>{const row=document.createElement('div');row.className='tickrow';for(const field of ['Time','Value']){const input=document.createElement('input');input.type='number';input.step='any';input.value=tick[field];input.setAttribute('aria-label',`${key} keyframe ${i} ${field}`);input.title=field;input.onchange=()=>{const v=Number(input.value);if(input.value===''||!Number.isFinite(v)){status('Invalid keyframe');return;}commit(n=>{n[key].Ticks[i][field]=v;const ticks=n[key].Ticks;if(ticks.some((t,j)=>j>0&&ticks[j-1].Time>=t.Time))throw Error('Keyframe times must increase.');});};row.append(input);}const remove=document.createElement('button');remove.textContent='−';remove.disabled=ts.length<=1;remove.onclick=()=>commit(n=>n[key].Ticks.splice(i,1));row.append(remove);details.append(row);});const add=document.createElement('button');add.textContent='Add keyframe';add.onclick=()=>commit(n=>{const last=n[key].Ticks.at(-1);n[key].Ticks.push({...last,Time:last.Time+.25});});details.append(add);

      }

    }

  }

  $('editLayer').onchange=()=>{selected=$('editLayer').value;form();};$('advancedEdit').onchange=form;

  $('undoEdit').onclick=()=>{if(cursor>0){state=clone(history[--cursor]);update();preview(clone(state));}};

  $('redoEdit').onclick=()=>{if(cursor+1<history.length){state=clone(history[++cursor]);update();preview(clone(state));}};

  $('resetEdit').onclick=()=>{if(state){state=clone(original);history.push(clone(state));cursor=history.length-1;update();preview(clone(state));}};

  $('saveDraft').onclick=()=>{if(state)download(new Blob([JSON.stringify({format:'DS1EffectStudioDraft1',original,draft:state},null,2)],{type:'application/json'}),`f${state.id}.draft.json`);};

  $('openDraft').onclick=()=>$('draftFile').click();$('draftFile').onchange=async()=>{try{const data=JSON.parse(await $('draftFile').files[0].text());if(data.format!=='DS1EffectStudioDraft1'||data.original.sha256!==original?.sha256)throw Error('Open the matching original effect before importing this draft.');exportPatch(original,data.draft);state=clone(data.draft);history.push(clone(state));cursor=history.length-1;update();preview(clone(state));}catch(e){status(e.message);}finally{$('draftFile').value='';}};

  $('saveFfx').onclick=async()=>{try{if(!state)return;status('Writing and validating FFX…');const r=await fetch('/api/export-ffx',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(exportPatch(original,state))});if(!r.ok)throw Error((await r.json()).error);download(await r.blob(),`f${String(state.id).padStart(7,'0')}.ffx`);status('Validated FFX exported. Original game files were not changed.');}catch(e){status(e.message);}};

  return {

    change,select(target){selected=target;update();},getState(){return state;},patch(){return exportPatch(original,state);},

    snapshot(){return original?clone({original,state,history,cursor,selected}):null;},

    restore(saved){({original,state,history,cursor,selected}=clone(saved));update();},

    reset(fx){original=clone(fx);state=clone(fx);history=[clone(fx)];cursor=0;selected=null;update();}

  };

}

