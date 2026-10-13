// FFX preview interpreter. Keep uncertain runtime semantics explicit in diagnostics.
export const renderedTypes = new Set([27,40,59,61,70,71,108]);
export function random(seed, channel=0) { let x=(Math.imul(seed|0,1664525)+Math.imul(channel+1,1013904223))|0; x=Math.imul(x^(x>>>16),0x45d9f3b);x=Math.imul(x^(x>>>16),0x45d9f3b);return ((x^(x>>>16))>>>0)/4294967296; }
export function curve(f,time=0,seed=1,fallback=1,resources=[],depth=0) {
  if(!f||f.kind==='Empty'||depth>8)return fallback;
  if(typeof f==='number')return Number.isFinite(f)?f:fallback;
  let v=f.Value??f.Base??f.Tick??fallback;
  if(f.Ticks?.length){const ticks=f.Ticks;let t=time;const end=ticks.at(-1).Time;
    if(f.kind?.startsWith('Repeating')&&end>0)t=((t%end)+end)%end;
    if(t<=ticks[0].Time)v=ticks[0].Value;
    else if(t>=end)v=ticks.at(-1).Value;
    else{let i=1;while(i<ticks.length&&ticks[i].Time<t)i++;const a=ticks[i-1],b=ticks[i];const k=(t-a.Time)/(b.Time-a.Time||1);v=f.kind?.includes('Const')||f.kind?.startsWith('Int')?a.Value:a.Value+(b.Value-a.Value)*k;}
  }
  if(f.kind==='FieldType25'||f.kind==='FieldType27'||f.kind?.startsWith('Ranged'))v*=f.Min+(f.Max-f.Min)*random(seed,3);
  if(f.ResourceIndex!=null&&resources[f.ResourceIndex])v*=curve(resources[f.ResourceIndex].Data,time,seed,1,resources,depth+1);
  return Number.isFinite(v)?v:fallback;
}
export function compileEffect(effect) {
  const objects=effect.objects, resolve=v=>v?.ref?objects[v.ref]:v;
  const root=resolve(effect.root), base=(resolve(root?.Container2)?.FXNodes??[]), layers=[], sounds=[], warnings=new Set(), visited=new Set();
  const identity=new Map(Object.entries(objects).map(([key,value])=>[value,key]));
  const knownActions=new Set([0,1,5,14,16,17,27,28,29,30,31,32,35,40,55,59,61,70,71,75,79,84,95,105,108]);
  function nodes(container){return (resolve(container)?.FXNodes??[]).map(resolve).filter(Boolean);}
  function schedule(id,ns,mod,parent){
    const ps=ns.filter(x=>!['ActionCallNode','EffectCallNode','IndexedActionNode','IndexedEffectNode'].includes(x.kind));
    const value=(i,f=0)=>curve(ps[i],0,1,f);
    let s={delay:parent.delay??0,interval:0,count:1,window:Infinity,multiplier:1,continuous:false};
    if(id===2023||id===2024){s.delay+=Math.max(0,value(3));s.interval=Math.max(1/60,mod?.Unk4>0?mod.Unk4:value(6,1/30));s.count=mod?.Unk3??value(5,1);s.window=mod?.Lifetime>0?mod.Lifetime:(value(1)>0?value(1):Infinity);s.multiplier=ps[4];s.continuous=s.count<0;}
    else if(id===2032||id===2034){s.delay+=Math.max(0,value(1));let interval=ps[2];s.interval=Math.max(1/60,((interval?.Tick1??0)+(interval?.Tick2??0))/2);let counts=ps[0];s.count=Math.round(((counts?.X??1)+(counts?.Y??1))/2);s.multiplier=ps[3];let w=ps[4];s.window=((w?.Tick1??-1)+(w?.Tick2??-1))/2;if(s.window<=0)s.window=Infinity;s.continuous=s.count<0;}
    else if(id===2101||id===2102){s.delay+=Math.max(0,value(2));s.window=value(0)>0?value(0):Infinity;}
    else if(![0,2020,2031,2116,2117,2121,2123].includes(id))warnings.add(`Effect function ${id}: scheduling uses a fallback.`);
    if(parent.window!=null)s.window=Math.min(s.window,parent.window);
    const delayIndex=[2023,2024].includes(id)?3:[2032,2034].includes(id)?1:[2101,2102].includes(id)?2:-1;
    s.delayTarget=ps[delayIndex]?.kind==='TickNode'?identity.get(ps[delayIndex]):null;
    s.inheritedDelay=parent.delay??0;
    s.ancestors=[...(parent.ancestors??[]),{id,params:ps.map(x=>identity.get(x)),modifier:identity.get(mod)}];
    s.count=s.count===0?0:Math.max(1,s.count);
    return s;
  }
  function walk(v,ctx,depth=0,path='root') {
    if(depth>40){warnings.add('Recursive effect chain truncated at depth 40.');return;}
    let n=resolve(v);if(!n)return;
    if(n.kind==='IndexedEffectNode'||n.kind==='IndexedActionNode'){
      const source=n.Type===2?(ctx.base??base):(ctx.params??[]);const r=source[n.Index];if(r)walk(r,ctx,depth+1,path+'/index'+n.Index);else warnings.add(`Unresolved ${n.kind} ${n.Type}:${n.Index}`);return;
    }
    if(n.kind==='EffectCallNode') {
      if(n.EffectID===0)return;
      const ns=nodes(n.Container),c=resolve(n.Container),mod=resolve(c?.Modifier),actions=ns.filter(x=>x.kind==='ActionCallNode');
      const appearances=actions.map(a=>({a,c:resolve(a.Container)})).filter(x=>x.c?.ActionData);
      const secondary=actions.map(a=>({type:a.ActionType,nodes:nodes(a.Container),data:resolve(resolve(a.Container)?.ActionData),modifier:resolve(resolve(a.Container)?.Modifier)}));
      const chain=[...ctx.transforms,...secondary.filter(x=>[1,35].includes(x.type))];
      const timing=schedule(n.EffectID,ns,mod,ctx.schedule);
      const childCtx={...ctx,transforms:chain,schedule:timing,params:resolve(n.Container)?.FXNodes??[],function:n.EffectID};
      for(const {a,c:ac} of appearances){const data=resolve(ac.ActionData);if(renderedTypes.has(data.Type)){
        const key=path+'/'+a.ActionType+'/'+ac.ActionData.ref;
        if(!visited.has(key)){visited.add(key);layers.push({key,target:ac.ActionData.ref,callTarget:identity.get(n),action:a.ActionType,data,schedule:timing,transforms:chain,emitter:secondary.find(x=>[28,29,30,31,32].includes(x.type))?.data,movement:secondary.find(x=>[55,84,105].includes(x.type))?.data,enabled:true,function:n.EffectID});}
      }else if(![28,29,30,31,32,55,84,105].includes(data.Type))warnings.add(`Action ${data.Type} (${data.kind}): decoded but not rendered.`);}
      for(const a of actions){if(a.ActionType===75){const params=nodes(a.Container),sound=params.find(x=>/^SoundIDNode/.test(x.kind));if(sound)sounds.push({target:identity.get(sound),callTarget:identity.get(n),soundId:sound.SoundID,schedule:timing,volume:params.find(x=>x.kind==='FloatNode')?.Value??1});}if(!knownActions.has(a.ActionType))warnings.add(`Action ${a.ActionType}: runtime behavior not implemented; child effects use inherited timing.`);walkContainer(a.Container,childCtx,depth+1,path+'/a'+a.ActionType);}
      for(const s of effect.pendingSounds??[])if(s.target===identity.get(n))sounds.push({callTarget:s.target,soundId:s.soundId,schedule:timing,volume:1,pending:true});
      let childIndex=0;for(const child of ns){if(child.kind==='EffectCallNode'||child.kind==='IndexedEffectNode')walk(child,childCtx,depth+1,path+'/c'+childIndex++);}
      return;
    }
    if(n.kind==='ActionCallNode'||n.kind==='FXAction') {walkContainer(n.Container,ctx,depth+1,path+'/a'+n.ActionType);return;}
    if(n.kind.startsWith('EffectCreate')) {
      if(n.Nodes){n.Nodes.forEach((child,i)=>walk(child,ctx,depth+1,path+'/constructor'+i));return;}
      const childCtx={...ctx,base:resolve(n.Container2)?.FXNodes??ctx.base};
      const states=(n.States??[]).map(resolve);if(states[0])for(const [i,a]of states[0].Actions.entries())walk(a,childCtx,depth+1,path+'/s0a'+i);
      if(!states.length)walkContainer(n.Container2,childCtx,depth+1,path+'/constructor');return;
    }
    for(const key of ['Node','Node1','Node2'])if(n[key])walk(n[key],ctx,depth+1,path+'/'+key);
  }
  function walkContainer(v,ctx,depth,path) {
    const c=resolve(v);if(!c)return;const mod=resolve(c.Modifier);let ns=c.FXNodes??[];
    if(mod?.ModifierType===0)ns=ns.slice(0,Math.max(0,mod.Unk+1));
    ns.forEach((n,i)=>walk(n,ctx,depth+1,path+'/'+i));
  }
  walk(effect.root,{transforms:[],schedule:{delay:0,window:Infinity}},0);
  if(!layers.length){warnings.add('No executable render layers found in the initial state. Resource inspection is still available.');}
  if(layers.some(l=>l.action===40))warnings.add('Trails use a planar preview; game motion history is unavailable.');
  if(layers.some(l=>l.action===70))warnings.add('Multi-texture modulation is reconstructed; shader equivalence is unverified.');
  // Group numbers identify the native effect-call container shared by its actions.
  // Parameter edits preserve these identities; this is a display label, not an FFX ID.
  const groupNumbers=new Map(),groups=[];
  for(const item of [...layers,...sounds]){
    if(!groupNumbers.has(item.callTarget)){const number=groupNumbers.size+1;groupNumbers.set(item.callTarget,number);groups.push({number,target:item.callTarget,function:objects[item.callTarget]?.EffectID});}
    item.groupNumber=groupNumbers.get(item.callTarget);
  }
  return {layers,sounds,groups,warnings:[...warnings]};
}
export function spawnTimes(layer,time,seed,limit=160){
  const s=layer.schedule,a=layer.data;
  const duration=Math.max(1/60,(a.Duration>0?a.Duration:(Number.isFinite(s.window)?s.window:10))*(a.DurationMult||1));
  const t=time-s.delay;if(t<0||s.count===0)return [];
  if(s.interval<=0)return t<duration?[{birth:s.delay,index:0,duration}]:[];
  const end=Math.min(t,s.window),last=Math.floor(end/s.interval),first=Math.max(0,Math.floor((t-duration-Math.abs(a.LifetimeVariance??0))/s.interval));
  const out=[];
  for(let i=first;i<=last&&out.length<limit;i++){
    let count=Math.max(1,Math.round(curve(s.multiplier,i*s.interval,seed,1)));count=Math.min(count,32);
    for(let j=0;j<count&&out.length<limit;j++){
      const index=i*count+j;if(!s.continuous&&index>=s.count)continue;
      const birth=s.delay+i*s.interval,life=Math.max(1/60,duration+(a.LifetimeVariance??0)*random(seed+index,90));
      if(time-birth<life)out.push({birth,index,duration:life});
    }
  }
  return out;
}
