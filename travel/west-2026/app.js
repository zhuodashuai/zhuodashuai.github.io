const DATA=window.WEST_TRAVEL;
const P=DATA.plan,PLACES=DATA.places,GEOMETRY=DATA.geometry;
let option=P.primaryOption,mode='person',selectedPlace='sf',expanded=false;
const included=new Set(['sf','yosemite','monterey','la','vegas','death','grand','page','monument','yellowstone','kayak','zion','bryce','route66','joshua','bigsur']);
let extra=new Set();
const el=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usd=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const amount=n=>usd(mode==='person'?n/P.party:n);
const badge=s=>`<span class="badge ${esc(s)}">${{quote:'官网日期样本',published:'官方价表',user:'用户报价／目标',estimate:'估算／待核'}[s]||s}</span>`;
const link=(url,text)=>url?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>`:esc(text);
function render(){
 const o=P.options.find(x=>x.id===option),t=o.totals;
 el('option-cards').innerHTML=P.options.map(x=>`<article class="opt ${x.id===option?'selected':''}"><h3>${esc(x.name)}</h3><p class="small">12/8 →12/31 · 24天</p><div class="cost">${amount(x.totals.plannedGroupUSD)}</div><div class="small">${mode==='person'?'每人':'两人合计'} · ${x.id==='target'?'条件预算，非全套已核价':'含标记的待核占位，非全市场最低'}</div><p>${esc(x.summary)}</p><button type="button" data-option="${x.id}" aria-pressed="${x.id===option}">${x.id===option?'正在查看':'查看逐日明细'}</button></article>`).join('');
 el('option-cards').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{option=b.dataset.option;render();}));
 el('option-title').textContent=o.name;el('option-summary').textContent=o.summary;el('option-recommend').textContent=o.recommendation;
 el('budget-breakdown').innerHTML=Object.entries(t.categoryUSD).map(([k,v])=>`<div class="budget-row"><span>${esc(k)}</span><strong>${amount(v)}</strong></div>`).join('')+`<div class="budget-row total"><span>${o.id==='target'?'条件预算':'所选样本与占位总额'}</span><strong>${amount(t.plannedGroupUSD)}</strong></div>`;
 const a=P.audit;
 el('budget-reason').textContent=`A按你提供的团费、15晚房费$1,400、交通$500/人计算，补14日晚一间$140占位和两人一张年卡后$6,408.61/人。这个算术成立，但对应低价订单未齐。当前四段官网基础票合计${usd(a.flightBasicPerPersonUSD)}/人，加黄石机场往返已约${usd(a.flightAndYellowstoneBusPerPersonUSD)}/人，尚未包括海岸和城市交通。`;
 el('optimization').textContent=`B已换更低的去程、符合31日晚出发的返程与本次酒店样本；餐费维持$960/人，小费$160/人，不重复黄石团内住宿/餐饮/小费。A未给Big Sur向导单独留钱，0不是免费；B按官方185/人四小时徒步另列，再核接送。只把去程改为$100/人，仍不足以证明全交通$500/人。`;
 el('daily-list').innerHTML=o.itinerary.map(d=>`<details class="day" ${expanded?'open':''}><summary><span class="date"><b>${d.date.slice(5).replace('-','/')}</b><br>${d.weekday} · D${d.day}</span><span><strong>${esc(d.title)}</strong><span class="stay">${esc(d.overnight)}</span></span><span class="amount">${amount(d.totalGroupUSD)}<small>${mode==='person'?'每人':'两人合计'} · 展开明细</small></span></summary><div class="day-body"><p class="schedule">${esc(d.schedule)}</p>${d.notes.map(n=>`<p>${esc(n)}</p>`).join('')}<table class="items"><thead><tr><th>项目／价格依据</th><th class="number">${mode==='person'?'每人':'两人'}</th></tr></thead><tbody>${d.items.map(x=>`<tr><td>${link(x.sourceURL,x.label)} ${badge(x.status)}${x.note?`<span class="item-note">${esc(x.note)}</span>`:''}</td><td class="number">${amount(x.amountGroupUSD)}</td></tr>`).join('')}<tr><td><strong>本日合计</strong></td><td class="number"><strong>${amount(d.totalGroupUSD)}</strong></td></tr></tbody></table></div></details>`).join('');
 el('expand-days').textContent=expanded?'收起全部明细':'展开全部明细';
 el('tour-list').innerHTML=P.tours.map(x=>{const d=o.itinerary.find(d=>d.date===`2026-12-${x.date.slice(3,5).replace('–','').padStart(2,'0')}`);const it=d?.items.find(i=>i.category==='跟团'||i.category==='海岸向导');return `<article class="tour"><h3>${esc(x.operator)}</h3><p><strong>${esc(x.date)}</strong></p><div class="tour-cost">${amount(it?.amountGroupUSD??x.groupUSD)} ${badge(it?.status??x.status)}</div><p>${esc(it?.note||x.notes)}</p>${link(x.sourceURL,'产品与预订入口')}</article>`;}).join('');
 renderMap();renderPlace();
}
function renderFlights(){
 el('flight-list').innerHTML=P.flights.map(f=>`<tr><td>${f.date}<br><strong>${esc(f.route)}</strong><br>${esc(f.airline)} ${esc(f.flight)}</td><td>${esc(f.time)}</td><td class="number">${usd(f.basicGroupUSD/2)}</td><td class="number">${usd(f.carryGroupUSD/2)}</td><td>${link(f.sourceURL,'航司官网')} ${badge(f.status)}<br>${esc(f.carryNote)}${f.note?`<br><span class="small">${esc(f.note)}</span>`:''}</td></tr>`).join('');
 const a=P.audit;el('flight-subtotal').textContent=`四段基础机票 ${usd(a.flightBasicPerPersonUSD)}/人 · 全部含随身箱 ${usd(a.flightCarryPerPersonUSD)}/人`;
 el('transport-audit').textContent=`黄石官网往返机场巴士原价$110.81+$115.25/人，冬季套餐9折，约$203.45/人。基础机票加这段巴士约${usd(a.flightAndYellowstoneBusPerPersonUSD)}/人。其它接驳、Big Sur司机及城市交通见B逐日明细；目前未核出整趟$500/人的同日期可订组合。`;
 el('headline-audit').textContent=`去程已找到Southwest官网$135.59/人，含随身箱；用户携程截图同班¥880起。12/31晚返程$212.20/人。A的$6,408.61是按低价目标计算；已核机票与黄石接送已经超过$500整趟交通目标，详细差距如下。`;
}
function renderHotels(){
 const hs=P.hotels.length?P.hotels:P.hotelSegments;
 el('hotel-list').innerHTML=hs.map(h=>`<article class="hotel"><h3>${esc(h.hotel)}</h3><p class="small">${esc(h.checkIn||h.dates?.map(d=>'12/'+d).join('、'))}${h.checkOut?' → '+esc(h.checkOut):''} · ${h.nights||h.dates?.length}晚 · 两成人一间</p><div class="hotel-cost">${h.totalUSD!=null?usd(h.totalUSD):'含税总价待核'} <span class="small">整段／间</span></div>${badge(h.status||'quote')}<p>${esc(h.room||'')}</p><p>${esc(h.note||h.notes||'')}</p>${h.cancellation?`<p class="small">退改：${esc(h.cancellation)}</p>`:''}${link(h.sourceURL,'官网日期查询入口')}</article>`).join('');
 el('fontainebleau-note').textContent='官网早前当日实选12/23–25两晚一间$485.72，含税及度假费，公开FBFL26促销；不是每晚$485，也不能拿基础$159.20当全包价。是否仍有同价房待选择前刷新；未加入A/B/C。与所选低价酒店这两晚的差额及搬家车费另算。';
}

function renderPlace(){
 const p=PLACES.find(x=>x.id===selectedPlace),isIn=included.has(p.id);
 el('place-detail').innerHTML=`<div class="photo" id="place-photo">${p.photo?`<img src="${esc(p.photo.url)}" alt="${esc(p.photo.alt||p.name)}" loading="lazy">`:''}<span class="photo-fallback">照片暂未载入 · ${esc(p.name)}<br>下方保留景点与官方链接。</span></div><div class="detail-content"><h3>${esc(p.name)}</h3><p class="small">${esc(p.en)} · ${isIn?(p.id==='bigsur'?'计划待核接送与步道':'本版已安排'):'可讨论加入，未计入账单'}</p><p>${esc(p.see)}</p><p class="small">${esc(p.winter)}</p>${!isIn?`<label><input type="checkbox" id="extra-check" ${extra.has(p.id)?'checked':''}> 我想考虑加入这个景点</label><br>`:''}<p>${link(p.url,'景点官方信息')}</p>${p.photo?`<p class="small">${link(p.photo.source,p.photo.credit||'照片来源')} · 照片用于认景，不代表冬季当天景色</p>`:''}</div>`;
 const img=el('place-photo').querySelector('img');if(img)img.addEventListener('error',()=>el('place-photo')?.classList.add('failed'));else el('place-photo').classList.add('failed');
 const check=el('extra-check');if(check)check.addEventListener('change',()=>{check.checked?extra.add(p.id):extra.delete(p.id);renderMap();});
}
function renderMap(){
 const svg=d3.select('#route-map');const width=Math.max(280,el('route-map').parentElement.clientWidth),height=Math.max(320,Math.min(570,width*.77));
 svg.attr('viewBox',`0 0 ${width} ${height}`).attr('height',height);svg.selectAll('*').remove();
 svg.append('title').text('美西已安排景点与可选景点');
 const points=PLACES.map(p=>[p.lon,p.lat]);const projection=d3.geoMercator().fitExtent([[23,22],[width-23,height-25]],{type:'MultiPoint',coordinates:points});const gp=d3.geoPath(projection);
 svg.append('g').selectAll('path').data(GEOMETRY.features).join('path').attr('d',gp).attr('class','state');
 const routes=[{ids:['sf','monterey','kayak'],type:'ground'},{ids:['monterey','bigsur','monterey','sf'],type:'ground'},{ids:['sf','yosemite'],type:'ground'},{ids:['sf','yellowstone','vegas'],type:'flight'},{ids:['vegas','zion','bryce','page','monument','grand','route66','vegas'],type:'ground'},{ids:['vegas','death'],type:'ground'},{ids:['vegas','joshua','la'],type:'ground'}];
 routes.forEach(r=>{const coords=r.ids.map(id=>{const p=PLACES.find(x=>x.id===id);return [p.lon,p.lat];});svg.append('path').attr('d',gp({type:'LineString',coordinates:coords})).attr('class',r.type==='flight'?'flight-line':'ground-line');});
 svg.append('g').selectAll('circle').data(PLACES).join('circle').attr('cx',p=>projection([p.lon,p.lat])[0]).attr('cy',p=>projection([p.lon,p.lat])[1]).attr('r',p=>p.id===selectedPlace?8:5).attr('class',p=>`dot ${included.has(p.id)?'':'optional'} ${p.id===selectedPlace?'active':''}`).on('click',(event,p)=>{selectedPlace=p.id;renderMap();renderPlace();});
 const labels=width>520?['sf','la','vegas','yellowstone','grand','page','monument','yosemite','monterey']:['sf','la','vegas','yellowstone'];
 svg.append('g').selectAll('text').data(PLACES.filter(p=>labels.includes(p.id))).join('text').attr('x',p=>projection([p.lon,p.lat])[0]+(p.id==='sf'?-7:8)).attr('y',p=>projection([p.lon,p.lat])[1]+({page:-13,grand:15,monument:4,yosemite:0,monterey:14,sf:-9}[p.id]||-8)).attr('text-anchor',p=>p.id==='sf'?'end':'start').attr('class','map-label').text(p=>p.short||p.name);
 el('place-buttons').innerHTML=PLACES.map(p=>`<button type="button" data-place="${p.id}" aria-pressed="${selectedPlace===p.id}">${esc(p.short||p.name)}${included.has(p.id)?' · 已排':extra.has(p.id)?' · 想加':''}</button>`).join('');
 el('place-buttons').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{selectedPlace=b.dataset.place;renderMap();renderPlace();}));
}

el('fare-evidence').src=DATA.evidence;
el('stanford-link').href=P.links.stanford;el('pass-link').href=P.links.passTours;
el('stanford-note').textContent=P.stanford;
el('driving-list').innerHTML=P.driving.map(s=>`<li>${esc(s)}</li>`).join('');
el('booking-list').innerHTML=P.bookingOrder.map(s=>`<li>${esc(s)}</li>`).join('');
el('unknown-list').innerHTML=P.unknowns.map(s=>`<li>${esc(s)}</li>`).join('');
el('money-mode').addEventListener('change',e=>{mode=e.target.value;render();});
el('expand-days').addEventListener('click',()=>{expanded=!expanded;render();});
el('print').addEventListener('click',()=>{expanded=true;render();window.print();});
try{el('decision').value=localStorage.getItem('west-official-team-decision')||'';}catch{}
el('decision').addEventListener('input',()=>{try{localStorage.setItem('west-official-team-decision',el('decision').value);}catch{}});
el('copy-decision').addEventListener('click',async()=>{
 const o=P.options.find(x=>x.id===option),text=`美西选择：${o.name}，${o.start}–${o.end}，两人${usd(o.totals.plannedGroupUSD)}，每人${usd(o.totals.plannedPerPersonUSD)}。金额含待核目标/估算，不是已订订单。\n想考虑：${[...extra].map(id=>PLACES.find(p=>p.id===id).name).join('、')||'无'}\n${el('decision').value}`;
 try{await navigator.clipboard.writeText(text);el('copy-status').textContent='已复制，可和链接一起发给队友。';}catch{el('copy-status').textContent='浏览器限制复制，请选中文字手动复制。';}
});
renderFlights();renderHotels();render();
new ResizeObserver(()=>renderMap()).observe(el('route-map').parentElement);
