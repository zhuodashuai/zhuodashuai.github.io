(() => {
 'use strict';
 const P=window.WEST_TRAVEL.plan,byId=id=>document.getElementById(id);
 const ids=['tours','transport','hotel','missing-night','food','tips','park'];
 const usd=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function update(){
  const v=Object.fromEntries(ids.map(id=>[id,Number(byId(id).value)]));
  if(ids.some(id=>!byId(id).value.trim()||!Number.isFinite(v[id])||v[id]<0||v[id]>100000)){
   byId('input-error').textContent='请输入0–100000之间的有效金额。';byId('total').textContent='待输入';byId('total-note').textContent='';return;
  }
  byId('input-error').textContent='';
  const cents=(Math.round(v.tours*200)+Math.round(v.transport*200)+Math.round(v.food*200)+Math.round(v.tips*200)+Math.round(v.hotel*100)+Math.round(v['missing-night']*100)+Math.round(v.park*100))/2;
  byId('total').textContent=usd(cents/100);
  byId('total-note').textContent=(cents<=650000?'算术在$6,500目标内。':'比$6,500目标高'+usd((cents-650000)/100)+'。')+' 这不是全部项目均已可订的证明；实际报价和未核项见主页面。';
 }
 byId('use-target').addEventListener('click',()=>{const v={tours:3893.61,transport:500,hotel:1400,'missing-night':140,food:960,tips:160,park:250};ids.forEach(id=>byId(id).value=v[id]);update();});
 byId('use-checked').addEventListener('click',()=>{
  const o=P.options.find(x=>x.id==='checked'),c=o.totals.categoryUSD,missing=o.itinerary.find(d=>d.date==='2026-12-14').items.filter(x=>x.category==='酒店').reduce((s,x)=>s+x.amountGroupUSD,0);
  const v={tours:(c['跟团']+(c['海岸向导']||0))/2,transport:(c['机票']+c['地面交通'])/2,hotel:Math.round((c['酒店']-missing)*100)/100,'missing-night':missing,food:c['餐饮']/2,tips:c['小费']/2,park:c['公园年卡']};
  ids.forEach(id=>byId(id).value=v[id]);update();
 });
 ids.forEach(id=>byId(id).addEventListener('input',update));
 byId('current-flight-rows').innerHTML=P.flights.map(f=>`<tr><td>${f.date}<br>${esc(f.route)}</td><td>${esc(f.airline)} ${esc(f.flight)}<br>${esc(f.time)}</td><td class="number">${usd(f.basicGroupUSD/2)}</td><td>${esc(f.carryNote)}<br><a href="${esc(f.sourceURL)}" target="_blank" rel="noopener">航司官网</a></td></tr>`).join('');
 byId('audit-facts').textContent=`四段官网基础机票${usd(P.audit.flightBasicPerPersonUSD)}/人，加黄石机场往返约${usd(P.audit.flightAndYellowstoneBusPerPersonUSD)}/人，尚未包括海岸与城市交通。因此目前未核出整趟交通$500/人的组合。`;
 byId('checked-totals').textContent=`A用户条件预算${usd(P.options[0].totals.plannedPerPersonUSD)}/人；B本次官网样本＋待核占位${usd(P.options[1].totals.plannedPerPersonUSD)}/人。B不是全市场最低或全部确认可订的总价。`;
 update();
})();
