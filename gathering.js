// Work poses share a fixed foot anchor and a shared scale, including raised tools.
const GATHER_ANIMATIONS={
  chop:{frames:8,size:128,renderSize:128.96,fps:8,targetOffset:76,label:'挥斧砍树',resource:'木材'},
  mine:{frames:8,size:128,renderSize:122.9,fps:8,targetOffset:101,label:'挥镐采矿',resource:'石材'},
  water:{frames:8,size:128,renderSize:107.31,fps:8,targetOffset:75,label:'舀水装桶',resource:'水'}
};
const gatheringArt={chop:new Image(),mine:new Image(),water:new Image(),targets:new Image()};
for(const kind of ['chop','mine','water'])gatheringArt[kind].src=`assets/hero-${kind}.png`;
gatheringArt.targets.src='assets/gather-targets.png';

function gatheringActionFor(area,routeId){
  if(area==='creek')return'water';if(area==='forest')return'chop';if(area==='ruins')return'mine';
  if(area!=='route')return null;
  if(['water','frost','holy'].includes(routeId))return'water';
  if(['ancient','poison'].includes(routeId))return'chop';
  if(['stone','machine','lava','void'].includes(routeId))return'mine';
  return null; // The beast route yields food and hides, so it must not depict woodcutting.
}
function gatheringFrameAtTime(kind,elapsedMs,rate=1){
  const config=GATHER_ANIMATIONS[kind];
  return config?Math.floor(Math.max(0,elapsedMs)*rate/1000*config.fps)%config.frames:0;
}
function gatheringCorrection(context){
  const screen=context.canvas;
  return screen.id==='scene'&&screen.clientWidth?screen.width*screen.clientHeight/(screen.height*screen.clientWidth):1;
}
function drawGatheringHero(context,kind,x,ground,elapsedMs,rate=1){
  const config=GATHER_ANIMATIONS[kind],art=gatheringArt[kind];
  if(!config||!art?.complete||art.naturalWidth<config.frames*config.size){drawSprite(context,kind==='water'?'collect':'hero',x,ground,kind==='water'?100:76);return;}
  const frame=gatheringFrameAtTime(kind,elapsedMs,rate),height=config.renderSize,width=height*gatheringCorrection(context);
  context.save();context.imageSmoothingEnabled=false;
  context.drawImage(art,frame*config.size,0,config.size,config.size,Math.round(x-width/2),ground-height,width,height);
  context.restore();
}
function drawGatheringTarget(context,kind,x,ground,elapsedMs,rate=1){
  const art=gatheringArt.targets;if(!art.complete||!art.naturalWidth)return;
  const index=kind==='chop'?0:kind==='mine'?1:3,size=256,height=kind==='chop'?150:kind==='mine'?142:150,width=height*gatheringCorrection(context);
  const phase=Math.max(0,elapsedMs)*rate/1000*8%8,impact=phase>=4&&phase<6?Math.sin((phase-4)/2*Math.PI):0;
  const sway=kind==='chop'?impact*2:0;
  context.save();context.imageSmoothingEnabled=false;
  context.drawImage(art,index*size,0,size,size,Math.round(x-width/2+sway),ground-height,width,height);
  if(kind==='chop'&&elapsedMs*rate>600){const w=49*gatheringCorrection(context);context.drawImage(art,2*size,0,size,size,x+30-w/2,ground-44,w,49);}
  context.restore();
}
function drawGatheringImpact(context,kind,x,ground,elapsedMs,rate=1){
  const phase=Math.max(0,elapsedMs)*rate/1000*8%8,active=kind==='water'?phase>=3&&phase<6:phase>=4&&phase<6;
  if(!active)return;
  const t=kind==='water'?(phase-3)/3:(phase-4)/2,contactX=x+(kind==='water'?40:57)*gatheringCorrection(context),contactY=ground-(kind==='chop'?44:kind==='mine'?23:5);
  context.save();context.globalAlpha=1-t;
  for(let i=0;i<7;i++){
    const dx=(i-3)*7*t,dy=-Math.sin(t*Math.PI)*(12+i%3*8)+t*t*10;
    context.fillStyle=kind==='water'?'#a7e3ed':kind==='chop'?(i%2?'#c89a59':'#f0cb89'):(i%2?'#e3cf92':'#abb6a2');
    context.fillRect(Math.round(contactX+dx),Math.round(contactY+dy),kind==='water'?2:3,kind==='water'?4:3);
  }
  context.restore();
}
