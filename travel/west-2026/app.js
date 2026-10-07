const DATA=window.WEST_TRAVEL;
const P=DATA.plan,PLACES=DATA.places,GEOMETRY=DATA.geometry;
let option='value',mode='person',selectedPlace='sf',expanded=false;
const mandatory=new Set(['sf','yosemite','monterey','la','vegas','death','grand','page','monument','yellowstone','kayak']);
const included=new Set([...mandatory,'zion','bryce','route66']);
let extra=new Set();
const el=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usd=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
const amount=n=>usd(mode==='person'?n/2:n);
const badge=s=>`<span class="badge ${s}">${{quote:'官网实选',published:'官方价表',estimate:'估算／待核'}[s]}</span>`;
const link=(url,text)=>url?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>`:esc(text);
function render(){
 const o=P.options.find(x=>x.id===option),t=o.totals;
 el('option-cards').innerHTML=P.options.map(x=>`<article class="opt ${x.id===option?'selected':''}"><h3>${esc(x.name)}</h3><p class="small">${x.start.slice(5)} → ${x.end} · ${x.days}天</p><div class="cost">${amount(x.totals.plannedGroupUSD)}</div><div class="small">${mode==='person'?'每人':'两人合计'}含估算与700两人总预留</div><p>${esc(x.summary)}</p><button type="button" data-option="${x.id}" aria-pressed="${x.id===option}">${x.id===option?'正在查看':'查看逐日计划'}</button></article>`).join('');
 el('option-cards').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{option=b.dataset.option;render();}));
 el('option-title').textContent=o.name;
 el('option-summary').textContent=o.summary;
 el('option-recommend').textContent=o.recommendation;
 el('budget-breakdown').innerHTML=Object.entries(t.categoryUSD).map(([k,v])=>`<div class="budget-row"><span>${esc(k)}</span><strong>${amount(v)}</strong></div>`).join('')+`<div class="budget-row"><span>保险／装备／洗衣（估算）</span><strong>${amount(200)}</strong></div><div class="budget-row"><span>应急预留</span><strong>${amount(500)}</strong></div><div class="budget-row total"><span>计划总额 · ${mode==='person'?'每人':'两人'}</span><strong>${amount(t.plannedGroupUSD)}</strong></div>`;
 const official=t.statusUSD.quote+t.statusUSD.published;
 el('budget-reason').textContent=`这版已核官网报价和官方费率计算合计${amount(official)}（${mode==='person'?'每人':'两人'}），尚未加餐饮／城市打车等估算。黄石套装两人$5,210固定保留，不能靠低价航班把整个行程降到每人$6,000。计划总额含所有黄色估算与预留，当前比每人目标多${usd(t.overTargetPerPersonUSD)}。`;
 el('daily-list').innerHTML=o.itinerary.map(d=>`<details class="day" ${expanded?'open':''}><summary><span class="date"><b>${d.date.slice(5).replace('-','/')}</b><br>${d.weekday} · D${d.day}</span><span><strong>${esc(d.title)}</strong><span class="stay">${esc(d.overnight)}</span></span><span class="amount">${amount(d.totalGroupUSD)}<small>${mode==='person'?'每人':'两人合计'} · 展开明细</small></span></summary><div class="day-body"><p class="schedule">${esc(d.schedule)}</p>${d.notes.map(n=>`<p>${esc(n)}</p>`).join('')}<table class="items"><thead><tr><th>项目／价格依据</th><th class="number">${mode==='person'?'每人':'两人'}</th></tr></thead><tbody>${d.items.map(x=>`<tr><td>${link(x.sourceURL,x.label)} ${badge(x.status)}${x.note?`<span class="item-note">${esc(x.note)}</span>`:''}</td><td class="number">${amount(x.amountGroupUSD)}</td></tr>`).join('')}<tr><td><strong>本日合计</strong></td><td class="number"><strong>${amount(d.totalGroupUSD)}</strong></td></tr></tbody></table></div></details>`).join('');
 el('expand-days').textContent=expanded?'收起全部明细':'展开全部明细';
 renderFlights(o);
 el('tour-list').innerHTML=P.tours.filter(x=>option==='coast-desert'||!x.operator.includes('（C）')).map(x=>`<article class="tour"><h3>${esc(x.operator)}</h3><p><strong>${esc(x.date)}</strong> · ${esc(x.product)}</p><div class="tour-cost">${amount(x.groupUSD)} ${badge(x.status)}</div><p>${esc(x.notes)}</p>${link(x.sourceURL,'官网产品与预订入口')}</article>`).join('');
 renderMap();renderPlace();
}
function renderFlights(o){
 el('air-money-label').textContent=mode==='person'?'每人含箱':'两人含箱';
 el('flight-list').innerHTML=o.itinerary.flatMap(d=>d.items.filter(x=>x.category==='机票').map(x=>({d,x}))).map(({d,x})=>{
 let f=P.flights.find(y=>x.label.startsWith(`${y.origin}→${y.destination}`));
 let time=f?`${f.departureLocal} → ${f.arrivalLocal}`:'';
 if(o.id==='comfort'&&d.day===1)time='09:20 EST →12:42 PST（直飞）';
 if(o.id==='comfort'&&d.day===20)time='21:10 PST →22:25 PST';
 if(o.id==='coast-desert'&&d.day===25)time='11:40 PST →22:05 EST（经BNA）';
 return `<tr><td>${d.date}<br>${esc(x.label.split(' · ')[0])}</td><td>${esc(time)}<br><span class="small">${esc(x.label.split(' · ')[1]||'')}</span></td><td>${badge(x.status)}<br>${link(x.sourceURL,'航司官网来源')}</td><td class="number">${amount(x.amountGroupUSD)}</td></tr>`;
 }).join('');
}
function renderHotels(){
 el('hotel-list').innerHTML=P.hotels.map(h=>`<article class="hotel"><h3>${esc(h.hotel)}</h3><p class="small">${h.checkIn} → ${h.checkOut} · ${h.nights}晚 · 两成人一间</p><div class="hotel-cost">${usd(h.totalUSD)} <span class="small">整段／间</span></div><p>${esc(h.room)} · ${esc(h.rate)}</p><dl><dt>含费口径</dt><dd>基础房 ${usd(h.roomBaseUSD)}；税 ${usd(h.taxesUSD)}${h.mandatoryAmenityFeeUSD?`；必付amenity ${usd(h.mandatoryAmenityFeeUSD)}`:''}${h.mandatoryResortFeeUSD?`；度假费 ${usd(h.mandatoryResortFeeUSD)}＋税${usd(h.resortFeeTaxUSD)}`:''}，均已含在总额。</dd><dt>早餐／停车</dt><dd>${h.breakfastIncluded?'早餐含':'早餐不含'} · ${esc(h.parkingExtra||(h.parkingIncluded?'停车含':'停车额外，金额待核'))}</dd><dt>取消截止</dt><dd>${esc(h.cancelBefore)}；最终确认单为准。</dd></dl>${h.notes?`<p class="small">${esc(h.notes)}</p>`:''}<p class="small">${h.airportShuttle?`机场接驳：${esc(h.airportShuttle)}。`:''}${h.depositUSD?`订时押金${usd(h.depositUSD)}是房费的一部分，不另加。`:''}</p>${link(h.sourceURL,'打开官网实际日期报价')}</article>`).join('');
}
function renderPlace(){
 const p=PLACES.find(x=>x.id===selectedPlace),isIn=included.has(p.id)||(option==='coast-desert'&&p.id==='joshua');
 el('place-detail').innerHTML=`<div class="photo" id="place-photo">${p.photo?`<img src="${esc(p.photo.url)}" alt="${esc(p.photo.alt||p.name)}" loading="lazy">`:''}<span class="photo-fallback">照片暂未载入 · ${esc(p.name)}<br>下方保留景点与官方链接。</span></div><div class="detail-content"><h3>${esc(p.name)}</h3><p class="small">${esc(p.en)} · ${isIn?'本版已安排':'可讨论加入，未计入账单'}</p><p>${esc(p.see)}</p><p class="small">${esc(p.winter)}</p>${!isIn?`<label><input type="checkbox" id="extra-check" ${extra.has(p.id)?'checked':''}> 我想考虑加入这个景点</label><br>`:''}<p>${link(p.url,'景点官方信息')}</p>${p.photo?`<p class="small">${link(p.photo.source,p.photo.credit||'照片来源')} · 照片用于认景，不代表冬季当天景色</p>`:''}</div>`;
 const img=el('place-photo').querySelector('img');if(img)img.addEventListener('error',()=>el('place-photo')?.classList.add('failed'));else el('place-photo').classList.add('failed');
 const check=el('extra-check');if(check)check.addEventListener('change',()=>{check.checked?extra.add(p.id):extra.delete(p.id);renderMap();});
}
function renderMap(){
 const svg=d3.select('#route-map');const width=Math.max(280,el('route-map').parentElement.clientWidth),height=Math.max(320,Math.min(570,width*.77));
 svg.attr('viewBox',`0 0 ${width} ${height}`).attr('height',height);svg.selectAll('*').remove();
 svg.append('title').text('美西已安排景点与可选景点');
 const points=PLACES.map(p=>[p.lon,p.lat]);const projection=d3.geoMercator().fitExtent([[23,22],[width-23,height-25]],{type:'MultiPoint',coordinates:points});const gp=d3.geoPath(projection);
 svg.append('g').selectAll('path').data(GEOMETRY.features).join('path').attr('d',gp).attr('class','state');
 const routes=[{ids:['sf','monterey','kayak'],type:'ground'},{ids:['sf','yosemite'],type:'ground'},{ids:['sf','yellowstone','vegas'],type:'flight'},{ids:['vegas','zion','bryce','page','monument','grand','route66','vegas'],type:'ground'},{ids:['vegas','death'],type:'ground'},option==='coast-desert'?{ids:['vegas','joshua','la'],type:'ground'}:{ids:['vegas','la'],type:'flight'}];
 routes.forEach(r=>{const coords=r.ids.map(id=>{const p=PLACES.find(x=>x.id===id);return [p.lon,p.lat];});svg.append('path').attr('d',gp({type:'LineString',coordinates:coords})).attr('class',r.type==='flight'?'flight-line':'ground-line');});
 svg.append('g').selectAll('circle').data(PLACES).join('circle').attr('cx',p=>projection([p.lon,p.lat])[0]).attr('cy',p=>projection([p.lon,p.lat])[1]).attr('r',p=>p.id===selectedPlace?8:5).attr('class',p=>`dot ${included.has(p.id)||(option==='coast-desert'&&p.id==='joshua')?'':'optional'} ${p.id===selectedPlace?'active':''}`).on('click',(event,p)=>{selectedPlace=p.id;renderMap();renderPlace();});
 const labels=width>520?['sf','la','vegas','yellowstone','grand','page','monument','yosemite','monterey']:['sf','la','vegas','yellowstone'];
 svg.append('g').selectAll('text').data(PLACES.filter(p=>labels.includes(p.id))).join('text').attr('x',p=>projection([p.lon,p.lat])[0]+(p.id==='sf'?-7:8)).attr('y',p=>projection([p.lon,p.lat])[1]+({page:-13,grand:15,monument:4,yosemite:0,monterey:14,sf:-9}[p.id]||-8)).attr('text-anchor',p=>p.id==='sf'?'end':'start').attr('class','map-label').text(p=>p.short||p.name);
 el('place-buttons').innerHTML=PLACES.map(p=>`<button type="button" data-place="${p.id}" aria-pressed="${selectedPlace===p.id}">${esc(p.short||p.name)}${included.has(p.id)||(option==='coast-desert'&&p.id==='joshua')?' · 已排':extra.has(p.id)?' · 想加':''}</button>`).join('');
 el('place-buttons').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{selectedPlace=b.dataset.place;renderMap();renderPlace();}));
}
el('correction').textContent=P.priceCorrection;
el('optimization').textContent=P.optimization;
el('fare-evidence').src=DATA.evidence;
el('viator-link').href=P.links.viator;el('bag-policy').href=P.links.swbags;el('alamo-link').href=P.links.alamo;el('stanford-link').href=P.links.stanford;el('pass-link').href=P.links.passTours;
el('stanford-note').textContent=P.stanford;
el('driving-list').innerHTML=P.driving.map(s=>`<li>${esc(s)}</li>`).join('');
el('booking-list').innerHTML=P.bookingOrder.map(s=>`<li>${esc(s)}</li>`).join('');
el('unknown-list').innerHTML=P.unknowns.map(s=>`<li>${esc(s)}</li>`).join('');
el('money-mode').addEventListener('change',e=>{mode=e.target.value;render();});
el('expand-days').addEventListener('click',()=>{expanded=!expanded;render();});
el('print').addEventListener('click',()=>{expanded=true;render();window.print();});
try{el('decision').value=localStorage.getItem('west-official-team-decision')||'';}catch{}
el('decision').addEventListener('input',()=>{try{localStorage.setItem('west-official-team-decision',el('decision').value);}catch{}});
el('copy-decision').addEventListener('click',async()=>{const o=P.options.find(x=>x.id===option),text=`美西选择：${o.name}，${o.start}–${o.end}，两人计划${usd(o.totals.plannedGroupUSD)}，每人${usd(o.totals.plannedPerPersonUSD)}（含估算预留）。\n另想考虑：${[...extra].map(id=>PLACES.find(p=>p.id===id).name).join('、')||'无'}\n${el('decision').value}`;try{await navigator.clipboard.writeText(text);el('copy-status').textContent='已复制，可与攻略一起发给队友。';}catch{el('copy-status').textContent='浏览器限制复制，请直接选中意见框里的文字复制。';}});
renderHotels();render();renderPlace();
new ResizeObserver(()=>renderMap()).observe(el('route-map').parentElement);
