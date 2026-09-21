'use strict';
const $ = id => document.getElementById(id);
const colors = ['#d4fc50','#8cbdff','#ff9986','#c8a1ff','#65d8bb','#ffe582','#f0a4d6','#89d7ed','#dfb184','#9bd9a5'];
const defaultPlayers = ['팀장', '혜', '신', '유'];
const draft = Array.from({ length: 10 }, (_, i) => ({ player: defaultPlayers[i] || '', result: '' }));
let count = 4, latest = {room:null,isHost:false}, connected = false, busy = false, serverOffset = 0;
let pollTimer, toastTimer, requestSeq = 0, acceptedSeq = 0, modalRound = null, boardKey = '', animationFrame = 0;
const canvas = $('ladder-canvas'), ctx = canvas.getContext('2d');
let width = 0, height = 0;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, 3800); }
function error(message) { $('error-message').textContent = message; $('error-banner').hidden = false; }
function setConnected(value) { connected = value; $('connection').className = 'connection ' + (value ? 'online' : 'offline'); $('connection-text').textContent = value ? '실시간 연결' : '연결 확인 중'; refreshButtons(); }
function refreshButtons() {
  $('create-btn').disabled = busy || !connected;
  $('count-minus').disabled = count <= 2 || busy;
  $('count-plus').disabled = count >= 10 || busy;
  for (const id of ['start-btn','skip-btn','reset-btn','confirm-reset']) $(id).disabled = busy || !connected;
  document.querySelectorAll('.start-node.ready').forEach(el => el.disabled = busy || !connected);
}
function forms() {
  $('player-count').value = count;
  $('form-rows').replaceChildren();
  for (let i = 0; i < count; i++) {
    const row = document.createElement('div'); row.className = 'input-row';
    const number = document.createElement('span'); number.className = 'slot-number'; number.textContent = String(i + 1).padStart(2,'0'); row.append(number);
    for (const field of ['player','result']) {
      const input = document.createElement('input'); input.type = 'text'; input.maxLength = 24; input.value = draft[i][field]; input.autocomplete = 'off';
      input.id = `${field}-${i}`; input.setAttribute('aria-label', `${i+1}번 ${field === 'player' ? '참가자 이름' : '결과'}`);
      input.placeholder = field === 'player' ? (defaultPlayers[i] || `참가자 ${i+1}`) : ['커피 당첨','통과!','통과!','간식 당첨'][i%4];
      input.addEventListener('input', () => { draft[i][field] = input.value; if (!latest.room) drawBoard(true); }); row.append(input);
    }
    $('form-rows').append(row);
  }
  refreshButtons(); if (!latest.room) drawBoard(true);
}
function preview() {
  return { players: draft.slice(0,count).map((p,i)=>p.player.trim() || (defaultPlayers[i] || `참가자 ${i+1}`)), results:draft.slice(0,count).map((p,i)=>p.result.trim() || ['커피 당첨','통과!','통과!','간식 당첨'][i%4]), lines:Array.from({length:count*2},(_,i)=>({col:i%(count-1),y:(i+1)/(count*2+1)})), played:Array(count).fill(false), status:'preview', active:null };
}
function applyState(data, seq) {
  if (seq < acceptedSeq) return;
  acceptedSeq = seq; latest = data; serverOffset = data.serverNow - Date.now();
  setConnected(true); $('error-banner').hidden = true;
  const room = data.room;
  $('setup-panel').hidden = !!room; $('room-panel').hidden = !room;
  document.querySelector('.workspace').classList.toggle('room-live', !!room);
  $('role-tag').textContent = !room ? '게임 준비' : data.isHost ? '방장' : '참가자';
  if (room) {
    const labels = {waiting:'팀원들을 초대하세요',playing:'지금, 운을 확인할 시간',finished:'모두의 선택이 끝났어요'};
    $('room-title').textContent = labels[room.status];
    $('room-description').textContent = data.isHost ? (room.status === 'waiting' ? '팀원이 모이면 사다리를 열어 주세요.' : '게임 시작과 종료는 방장만 할 수 있어요.') : '보드에서 내 이름을 눌러 참여하세요.';
    $('host-actions').hidden = !data.isHost;
    $('start-btn').hidden = room.status !== 'waiting'; $('skip-btn').hidden = room.status !== 'playing';
    $('guest-note').hidden = data.isHost || room.status === 'finished';
    $('guest-note').textContent = room.status === 'waiting' ? '방장이 게임을 시작하면 내 이름을 눌러 주세요.' : room.active ? '다른 참가자가 진행 중이에요. 잠시만 기다려 주세요.' : '위 보드에서 내 이름을 눌러 주세요.';
    $('results-btn').hidden = room.status !== 'finished';
    $('restart-game-btn').hidden = !data.isHost;
    const rosterKey = room.roundId + ':' + room.version;
    if ($('roster').dataset.key !== rosterKey) {
      $('roster').dataset.key = rosterKey; $('roster').replaceChildren();
      room.players.forEach((name,i)=>{
        const row = document.createElement('div'); row.className='roster-item'+(room.active?.index===i?' active':''); row.style.setProperty('--player-color',colors[i]);
        const avatar=document.createElement('span');avatar.className='avatar';avatar.textContent=String(i+1).padStart(2,'0');
        const label=document.createElement('span');label.className='roster-name';label.textContent=name;label.title=name;
        const status=document.createElement('span');status.className='roster-status';status.textContent=room.active?.index===i?'진행 중':room.played[i]?'완료':'대기';row.append(avatar,label,status);$('roster').append(row);
      });
    }
    if (room.status==='finished' && modalRound!==room.roundId) { modalRound=room.roundId; showResults(); }
    if (room.status!=='finished' && $('result-modal').open) $('result-modal').close();
  } else {
    modalRound=null;
    if($('result-modal').open)$('result-modal').close();
    if($('confirm-modal').open)$('confirm-modal').close();
  }
  drawBoard(); refreshButtons();
}
async function fetchState() {
  const seq=++requestSeq;
  try { const response=await fetch('/api/state',{cache:'no-store',signal:AbortSignal.timeout(9000)}); const data=await response.json(); if(!response.ok)throw new Error(data.error); applyState(data,seq); }
  catch(e){ if(seq>=acceptedSeq){setConnected(false);error(e.name==='TimeoutError'?'연결이 지연되고 있어요. 자동으로 다시 연결합니다.':e.message||'연결을 확인하고 다시 시도해 주세요.');} }
}
async function poll() { clearTimeout(pollTimer); await fetchState(); pollTimer=setTimeout(poll,document.hidden?4000:latest.room?.active?550:1300); }
async function action(name,extra={}) {
  if(busy)return false;
  busy=true;refreshButtons(); const seq=++requestSeq;
  try {
    const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:name,roundId:latest.room?.roundId,...extra}),signal:AbortSignal.timeout(10000)});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'요청을 처리하지 못했어요.');applyState(data,seq);return true;
  }catch(e){toast(e.name==='TimeoutError'?'요청 확인이 지연되고 있어요. 게임 상태를 다시 확인합니다.':e.message);await fetchState();return false;}
  finally{busy=false;refreshButtons();}
}
function drawBoard(force=false) {
  const room=latest.room||preview(), isPreview=!latest.room;
  const key=JSON.stringify([room.roundId,room.version,isPreview?room.players:null,isPreview?room.results:null]);
  $('stage-badge').textContent={preview:'미리보기',waiting:'참가자 대기',playing:'PLAYING',finished:'COMPLETE'}[room.status];
  $('stage-badge').className='stage-badge '+room.status;
  $('board-title').textContent=room.active?`${room.players[room.active.index]} 님의 차례!`:room.status==='finished'?'우리팀의 결과가 나왔어요':room.status==='playing'?'내 이름을 눌러 출발!':'누구에게 행운이 올까요?';
  $('board-hint').textContent=isPreview?'왼쪽에서 멤버와 결과를 정하고 방을 열어 주세요.':room.status==='waiting'?'준비 완료! 방장이 사다리를 열면 시작할 수 있어요.':room.status==='finished'?'결과를 복사해 팀원들과 나눠 보세요.':room.active?'한 명씩 출발합니다. 모두 함께 지켜봐 주세요.':'내 이름을 눌러 주세요. 한 명씩 차례로 진행돼요.';
  $('preview-label').hidden=!isPreview;
  const completed=room.played.filter(Boolean).length;
  $('progress-label').textContent=room.status==='playing'?'IN PROGRESS':room.status==='finished'?'COMPLETE':'READY';
  $('progress-count').textContent=`${completed} / ${room.players.length}`;$('progress-fill').style.width=`${completed/room.players.length*100}%`;
  if(force||key!==boardKey){
    boardKey=key;
    const n=room.players.length;$('board-inner').style.setProperty('--count',n);$('board-inner').style.minWidth=n>5?`${n*67}px`:'260px';
    $('starts-container').replaceChildren();$('ends-container').replaceChildren();
    room.players.forEach((name,i)=>{
      const start=document.createElement('button');const ready=room.status==='playing'&&!room.played[i]&&!room.active;
      start.className='node start-node'+(ready?' ready':'')+(room.played[i]?' played':'')+(room.active?.index===i?' active':'');start.style.setProperty('--player-color',colors[i]);start.textContent=name;start.title=name;start.setAttribute('aria-label',`${name}${room.played[i]?' 완료':' 사다리 출발'}`);start.disabled=!ready||busy||!connected;start.addEventListener('click',()=>action('play',{index:i}));$('starts-container').append(start);
      const end=document.createElement('div');end.className='node end-node';end.textContent=room.results[i];end.title=room.results[i];$('ends-container').append(end);
    });
    measure();
  }
  cancelAnimationFrame(animationFrame);paint();
}
function measure(){const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);width=rect.width;height=rect.height;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
function x(col,n){return (width/n)*(col+.5);}
function pathFor(room,start){let col=start;const pts=[{x:x(col,room.players.length),y:0}];for(const line of room.lines){if(line.col===col||line.col===col-1){pts.push({x:x(col,room.players.length),y:line.y*height});col+=line.col===col?1:-1;pts.push({x:x(col,room.players.length),y:line.y*height});}}pts.push({x:x(col,room.players.length),y:height});return pts;}
function strokePath(pts,color,progress=1,glow=false){
  const lengths=pts.slice(1).map((p,i)=>Math.hypot(p.x-pts[i].x,p.y-pts[i].y));let remaining=lengths.reduce((a,b)=>a+b,0)*progress;
  ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);let tip=pts[0];
  for(let i=0;i<lengths.length;i++){const fraction=Math.min(1,remaining/lengths[i]);tip={x:pts[i].x+(pts[i+1].x-pts[i].x)*fraction,y:pts[i].y+(pts[i+1].y-pts[i].y)*fraction};ctx.lineTo(tip.x,tip.y);remaining-=lengths[i];if(remaining<=0)break;}
  ctx.strokeStyle=color;ctx.lineWidth=glow?4:3;ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowBlur=glow?13:0;ctx.shadowColor=color;ctx.stroke();ctx.shadowBlur=0;
  if(glow){ctx.fillStyle=color;ctx.beginPath();ctx.arc(tip.x,tip.y,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(tip.x,tip.y,2.5,0,Math.PI*2);ctx.fill();}
}
function paint(){
  const room=latest.room||preview();ctx.clearRect(0,0,width,height);ctx.lineWidth=2;ctx.strokeStyle='#455052';ctx.lineCap='round';
  for(let i=0;i<room.players.length;i++){ctx.beginPath();ctx.moveTo(x(i,room.players.length),0);ctx.lineTo(x(i,room.players.length),height);ctx.stroke();}
  for(const l of room.lines){ctx.beginPath();ctx.moveTo(x(l.col,room.players.length),l.y*height);ctx.lineTo(x(l.col+1,room.players.length),l.y*height);ctx.stroke();}
  room.played.forEach((played,i)=>{if(played)strokePath(pathFor(room,i),colors[i]+'90');});
  if(!latest.room){for(let i=0;i<Math.min(count,4);i++)strokePath(pathFor(room,i),colors[i]+'24');}
  if(room.active){const now=Date.now()+serverOffset;const progress=Math.max(0,Math.min(1,(now-room.active.startAt)/(room.active.endAt-room.active.startAt)));strokePath(pathFor(room,room.active.index),colors[room.active.index],reducedMotion.matches?1:progress,true);const remaining=Math.max(0,(room.active.endAt-now)/1000);$('active-caption').textContent=`${room.players[room.active.index]} 님 진행 중 · ${remaining>0?remaining.toFixed(1)+'초':'결과 확인 중'}`;animationFrame=requestAnimationFrame(paint);}
  else $('active-caption').textContent=room.status==='finished'?'모든 참가자의 결과가 확정되었어요.':room.status==='playing'?'이름표를 눌러 다음 사다리를 출발하세요.':'우리팀의 선택을 기다리는 중';
}
function showResults(){const room=latest.room;if(!room||room.status!=='finished')return;$('result-list').replaceChildren();room.matches.forEach((match,i)=>{if(!match)return;const row=document.createElement('div');row.className='result-row';const avatar=document.createElement('span');avatar.className='avatar';avatar.style.setProperty('--player-color',colors[i]);avatar.textContent=String(i+1).padStart(2,'0');const name=document.createElement('span');name.textContent=match.player;const result=document.createElement('strong');result.textContent=match.result;row.append(avatar,name,result);$('result-list').append(row);});$('restart-game-btn').hidden=!latest.isHost;if(!$('result-modal').open)$('result-modal').showModal();}
async function copy(text,message){try{await navigator.clipboard.writeText(text);toast(message);}catch{const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();const success=document.execCommand('copy');area.remove();toast(success?message:'복사를 허용하거나 주소창의 링크를 직접 복사해 주세요.');}}
function downloadTemplate(){const csv='\uFEFF이름,결과\r\n팀장,커피 당첨\r\n혜,통과!\r\n신,통과!\r\n유,간식 당첨\r\n';const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='사다리타기_명단양식.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function parseCsv(text){const delim=text.split(/\r?\n/,1)[0].includes('\t')?'\t':',';const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===delim&&!quoted){row.push(cell.trim());cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;}if(quoted)throw new Error('CSV의 따옴표가 닫히지 않았습니다. 양식을 확인해 주세요.');row.push(cell.trim());if(row.some(Boolean))rows.push(row);if(rows[0]?.[0]==='이름'&&rows[0]?.[1]==='결과')rows.shift();return rows;}
async function importCsv(file){if(!file)return;try{if(file.size>100000)throw new Error('CSV는 100KB 이하로 올려 주세요.');const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer);let text;if(bytes[0]===255&&bytes[1]===254)text=new TextDecoder('utf-16le').decode(buffer);else if(bytes[0]===254&&bytes[1]===255)text=new TextDecoder('utf-16be').decode(buffer);else{try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{text=new TextDecoder('euc-kr').decode(buffer);}}const rows=parseCsv(text.replace(/^\uFEFF/,''));if(rows.length<2||rows.length>10)throw new Error('명단은 2~10명으로 작성해 주세요.');if(rows.some(r=>r.length!==2||r.some(c=>!c||c.length>24)))throw new Error('이름과 결과를 각각 1~24자로 입력해 주세요.');count=rows.length;rows.forEach((r,i)=>{draft[i]={player:r[0],result:r[1]};});forms();toast(`${count}명의 명단을 불러왔어요.`);}catch(e){toast(e.message);}finally{$('csv-upload').value='';}}
$('count-minus').addEventListener('click',()=>{count=Math.max(2,count-1);forms();});$('count-plus').addEventListener('click',()=>{count=Math.min(10,count+1);forms();});
$('create-btn').addEventListener('click',async()=>{const players=draft.slice(0,count).map((p,i)=>p.player.trim()||(defaultPlayers[i] || `참가자 ${i+1}`));const results=draft.slice(0,count).map((p,i)=>p.result.trim()||['커피 당첨','통과!','통과!','간식 당첨'][i%4]);if(new Set(players).size!==players.length){toast('참가자 이름은 서로 다르게 입력해 주세요.');return;}if(await action('create',{players,results}))toast('방이 열렸어요. 초대 링크를 팀원에게 보내 주세요.');});
$('start-btn').addEventListener('click',()=>action('start'));$('skip-btn').addEventListener('click',()=>action('skip'));
function confirmReset(){if(latest.isHost&&!$('confirm-modal').open)$('confirm-modal').showModal();}
$('reset-btn').addEventListener('click',confirmReset);$('restart-game-btn').addEventListener('click',()=>{$('result-modal').close();confirmReset();});$('cancel-reset').addEventListener('click',()=>$('confirm-modal').close());$('confirm-reset').addEventListener('click',async()=>{if(await action('reset')){$('confirm-modal').close();toast('새 게임을 준비해 주세요.');}});
$('results-btn').addEventListener('click',showResults);$('close-modal-btn').addEventListener('click',()=>$('result-modal').close());
$('copy-result-btn').addEventListener('click',()=>{if(latest.room?.status==='finished')copy('🎮 우리팀 사다리타기 결과\n'+latest.room.matches.filter(Boolean).map(m=>`${m.player} : ${m.result}`).join('\n'),'결과를 복사했어요!');});
$('share-btn').addEventListener('click',()=>copy(location.origin+'/', '초대 링크를 복사했어요!'));
$('upload-btn').addEventListener('click',()=>$('csv-upload').click());$('csv-upload').addEventListener('change',e=>importCsv(e.target.files[0]));$('template-btn').addEventListener('click',downloadTemplate);$('retry-btn').addEventListener('click',poll);
let resizeTimer;new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{measure();cancelAnimationFrame(animationFrame);paint();},50);}).observe($('board-inner'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});window.addEventListener('online',poll);
forms();poll();
// WebMCP progressive enhancement: actions retain the same session and server checks.
if(navigator.modelContext?.registerTool){
  navigator.modelContext.registerTool({name:'sadari_state',description:'현재 사다리 게임 상태와 내 방장 여부를 확인합니다.',inputSchema:{type:'object',properties:{}},execute:async()=>({content:[{type:'text',text:JSON.stringify(latest)}]})});
  navigator.modelContext.registerTool({name:'sadari_play',description:'진행 중인 사다리에서 지정한 참가자를 출발시킵니다. 다른 참가자가 진행 중이면 서버가 거절합니다.',inputSchema:{type:'object',properties:{index:{type:'integer',minimum:0,maximum:9,description:'참가자의 0부터 시작하는 번호'}},required:['index']},execute:async({index})=>({content:[{type:'text',text:await action('play',{index})?'출발했습니다.':'현재 출발할 수 없습니다.'}]})});
}

