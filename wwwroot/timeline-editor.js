const $=id=>document.getElementById(id);

export function createTimeline({editor,status,seek,onSelect=()=>{}}){

  let effect,compiled,selected=0,dragging=false;

  const activate=()=>document.querySelector('nav [data-tab="editor"]').click();

  function layer(){return compiled?.layers[selected];}

  function duration(l){return Math.max(.0167,(l.data.Duration>0?l.data.Duration:1)*(l.data.DurationMult||1));}

  function move(l,start){if(!l.schedule.delayTarget){status('This group uses indexed or unsupported timing; its bar is read-only.');return;}editor.change(fx=>fx.objects[l.schedule.delayTarget].Tick=Math.max(0,start-l.schedule.inheritedDelay));}

  function stretch(l,span){if(typeof l.data.Duration!=='number'){status('This action inherits its lifetime; resize it through detailed parameters.');return;}editor.change(fx=>fx.objects[l.target].Duration=Math.max(.0167,span)/(l.data.DurationMult||1));}

  function field(label,value,apply,disabled=false){const row=document.createElement('div');row.className='editfield';const lab=document.createElement('label');lab.textContent=label;const input=document.createElement('input');input.type='number';input.step='.0166667';input.min='0';input.value=Number(value.toFixed(3));input.disabled=disabled;input.setAttribute('aria-label',label);input.onchange=()=>{const n=Number(input.value);if(input.value!==''&&Number.isFinite(n)&&n>=0)apply(n);else status('Enter a non-negative number');};row.append(lab,input);$('selectedFields').append(row);}

  function select(i){selected=i;const l=layer();if(l)editor.select(l.target);paint();onSelect();activate();}

  function paint(){if(!compiled||dragging)return;const max=Math.max(1,+$('eventScale').value||10);const parent=$('eventRows');parent.replaceChildren();

    const ruler=document.createElement('div');ruler.className='eventRuler';ruler.textContent=Array.from({length:6},(_,i)=>(max*i/5).toFixed(1)+'s').join('                      ');parent.append(ruler);

    compiled.layers.forEach((l,i)=>{const row=document.createElement('div');row.className='eventRow'+(i===selected?' selected':'');const label=document.createElement('button');label.className='eventName';label.textContent=`G${l.groupNumber} · L${i+1} · ${l.data.ModelID!=null?'Mesh':'VFX'} ${l.action}`;label.title=`Group ${l.groupNumber} · Layer ${i+1} · action ${l.action} · shared effect function ${l.function}`;label.onclick=()=>select(i);const track=document.createElement('div');track.className='eventTrack';const bar=document.createElement('button');bar.className='eventBar';bar.setAttribute('aria-label',`Layer ${i+1} event bar`);const span=duration(l);bar.style.left=100*l.schedule.delay/max+'%';bar.style.width=100*span/max+'%';bar.textContent=`${l.schedule.continuous?'∞ ':''}${l.schedule.delay.toFixed(2)} → ${(l.schedule.delay+span).toFixed(2)}`;bar.title='Bar duration is one particle lifetime; the group may spawn multiple particles.';const edge=document.createElement('span');edge.className='eventResize';edge.setAttribute('aria-label',`Resize layer ${i+1}`);bar.append(edge);

      bar.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();selected=i;const delta=(e.key==='ArrowRight'?1:-1)/30;if(e.shiftKey)stretch(l,span+delta);else move(l,l.schedule.delay+delta);};

      bar.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();selected=i;editor.select(l.target);const resizing=e.target===edge;if(resizing&&typeof l.data.Duration!=='number'||!resizing&&!l.schedule.delayTarget){status('This bar inherits its timing and is read-only.');activate();return;}dragging=true;const x=e.clientX,width=track.getBoundingClientRect().width,start=l.schedule.delay,length=span;bar.setPointerCapture(e.pointerId);bar.onpointermove=ev=>{const delta=(ev.clientX-x)*max/width;if(resizing)bar.style.width=100*Math.max(.0167,length+delta)/max+'%';else bar.style.left=100*Math.max(l.schedule.inheritedDelay,start+delta)/max+'%';};bar.onpointerup=ev=>{bar.onpointermove=null;bar.onpointerup=null;dragging=false;const delta=(ev.clientX-x)*max/width;if(Math.abs(delta)>.002){if(resizing)stretch(l,length+delta);else move(l,start+delta);}paint();onSelect();activate();};bar.onpointercancel=()=>{dragging=false;paint();};};track.onclick=e=>{if(e.target===track)seek(Math.max(0,(e.clientX-track.getBoundingClientRect().left)/track.clientWidth*max));};track.append(bar);row.append(label,track);parent.append(row);});

    compiled.sounds.forEach((s,i)=>{const row=document.createElement('div');row.className='eventRow soundRow';const label=document.createElement('button');label.className='eventName';label.textContent=`G${s.groupNumber} · ♪ ${s.soundId}`;label.onclick=()=>document.querySelector('nav [data-tab="sounds"]').click();const track=document.createElement('div');track.className='eventTrack';const mark=document.createElement('span');mark.className='soundMark';mark.style.left=100*s.schedule.delay/max+'%';mark.textContent='♪';track.append(mark);row.append(label,track);parent.append(row);});

    $('selectedFields').replaceChildren();const l=layer();$('infiniteEffect').disabled=!l;$('selectedLabel').textContent=l?`Group ${l.groupNumber} · Layer ${selected+1} · ${l.data.ModelID!=null?'Model':'Texture'} · action ${l.action}`:'Select a timeline layer';if(l){field('Start (seconds)',l.schedule.delay,n=>move(l,n),!l.schedule.delayTarget);field('Particle duration (seconds)',duration(l),n=>stretch(l,n),typeof l.data.Duration!=='number');$('infiniteEffect').disabled=!l.schedule.ancestors.some(a=>[2023,2024,2032,2034].includes(a.id));}

  }

  $('eventScale').onchange=paint;

  $('infiniteEffect').onclick=()=>{const l=layer();if(!l)return;editor.change(fx=>{

    const write=(ref,key,value)=>{const o=fx.objects[ref];if(o&&typeof o[key]==='number')o[key]=value;};

    for(const a of l.schedule.ancestors){if([2023,2024].includes(a.id)){write(a.params[1],'Tick',-1);write(a.params[5],'Value',-1);write(a.modifier,'Lifetime',-1);write(a.modifier,'Unk2',-1);write(a.modifier,'Unk3',-1);}else if([2032,2034].includes(a.id)){write(a.params[0],'X',-1);write(a.params[0],'Y',-1);for(const i of [4,9]){write(a.params[i],'Tick1',-1);write(a.params[i],'Tick2',-1);}}else if([2101,2102].includes(a.id)){write(a.params[0],'Tick',-1);write(a.modifier,'Unk1',-1);}}

    });status('Native spawn limits removed for this timing chain. Game state changes and TAE events can still stop it. Export FFX or archive to save.');};

  return {update(fx,c){effect=fx;compiled=c;selected=Math.min(selected,Math.max(0,c.layers.length-1));paint();},selectedLayer:layer,select,playhead(t){$('eventRows').style.setProperty('--playhead',100*t/Math.max(1,+$('eventScale').value||10)+'%');}};

}

