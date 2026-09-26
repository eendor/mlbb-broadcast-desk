(() => {
  const NS='http://www.w3.org/2000/svg';let assets;
  const slots=[[[89,339],[89,405]],[[89,495],[89,561]],[[89,652],[89,719]],[[89,801],[89,868]],[[507,369],[507,528]],[[507,682],[507,830]],[[930,447],[930,756]]];
  function node(tag,attributes,text){const e=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attributes||{}))e.setAttribute(key,value);if(text!==undefined)e.textContent=text;return e;}
  function load(){return assets||=Promise.all([fetch('/assets/playoffs/bracket-defs.svg').then(r=>{if(!r.ok)throw Error('Bracket artwork unavailable');return r.text();}),fetch('/assets/playoffs/logo-boxes.json').then(r=>r.json())]).then(async result=>{
    const urls=[...new Set(result[0].match(/\/assets\/playoffs\/svg-media\/[^"< ]+/g)||[])];
    await Promise.all(urls.map(url=>{const image=new Image();image.src=url;return image.decode();}));return result;
  }).catch(e=>{assets=null;throw e;});}
  async function update(host,p){
    const token={};host._playoffToken=token;const [template,boxes]=await load();if(host._playoffToken!==token||!host.isConnected)return;
    let video=host.querySelector('.playoff-video-bg');
    if(!video){
      video=document.createElement('video');
      video.className='playoff-video-bg';
      video.src='/assets/playoffs/bracket.mp4';
      video.autoplay=true;
      video.loop=true;
      video.muted=true;
      video.playsInline=true;
      host.prepend(video);
      video.play().catch(()=>{});
    }
    let svg=host.querySelector('svg');
    if(!svg){
      svg=new DOMParser().parseFromString(template,'image/svg+xml').documentElement;
      host.append(document.importNode(svg,true));
      svg=host.querySelector('svg');
    }
    svg.querySelector('[data-playoff-live]')?.remove();
    const live=node('g',{'data-playoff-live':''});
    svg.append(live);
    const defMatches=Playoffs.defaults().matches;
    Playoffs.resolved(p).forEach((match,index)=>slots[index].forEach(([x,y],sideIndex)=>{
      const side=sideIndex?'red':'blue',name=match[side],entry=Playoffs.team(name),group=node('g',{'class':'playoff-slot','data-edit':`playoffs.matches.${index}.${side}`,'aria-label':`${index+1}: ${name||'Awaiting winner'}`});live.append(group);
      group.append(node('rect',{x,y:y-22,width:311,height:44,fill:'transparent','pointer-events':'all'}));
      
      const isQuarterDefault = index < 4 && name && name === defMatches[index]?.[side];
      if(!isQuarterDefault){
        if(index < 4){
          group.append(node('rect',{x:x+58,y:y-18,width:246,height:36,fill:'#f4f5f8',rx:3}));
        }
        if(entry){
          const [bx,by,bw,bh]=boxes[entry.id];
          const scale=Math.min(49/bw,39/bh);
          group.append(node('use',{href:'#playoff-logo-'+entry.id.replaceAll(' ','-'),transform:`translate(${x+93-bw*scale/2} ${y-bh*scale/2}) scale(${scale}) translate(${-bx} ${-by})`,'pointer-events':'none'}));
        }
        if(name){
          const label=node('text',{x:x+121,y:y+8,fill:'#100619','font-family':'Arial, sans-serif','font-weight':'700','font-size':'25','class':'playoff-team-label'},entry?.id||name);
          group.append(label);
          const width=label.getComputedTextLength();
          if(width>140)label.setAttribute('font-size',String(25*140/width));
        }
      }
      
      const score=node('text',{x:x+23,y:y+8,'text-anchor':'middle',fill:'#241906','font-family':'Arial, sans-serif','font-size':'23','font-weight':'700','data-edit':`playoffs.matches.${index}.${side}Score`,'class':'playoff-score'},name?match[side+'Score']:'');
      group.append(score);
      if(name&&match.winner===name)group.append(node('path',{d:`M ${x+2} ${y-21} H ${x+250}`,stroke:'#ffe785','stroke-width':3,'pointer-events':'none'}));
    }));
    host.dataset.ready='true';window.applyLiveLayout?.();
  }
  window.PlayoffBracket={update};
})();
