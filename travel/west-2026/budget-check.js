(() => {
 'use strict';
 const ids=['transport','hotel','food','missing-night','tips','park','add-flights','add-shuttle','add-maxtour'];
 const byId=id=>document.getElementById(id);
 const usd=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2}).format(value);
 const baseToursCents=389361;
 function update(){
  const numericIds=['transport','hotel','food','missing-night','tips','park'];
  const values=Object.fromEntries(numericIds.map(id=>[id,Number(byId(id).value)]));
  if(numericIds.some(id=>byId(id).value.trim()===''||!Number.isFinite(values[id])||values[id]<0||values[id]>100000)){
   byId('input-error').textContent='请输入0–100000之间的有效金额。';
   byId('total').textContent='待输入';
   byId('total-note').textContent='';byId('extra-note').textContent='';return;
  }
  byId('input-error').textContent='';
  const extras=[];
  let totalCents=baseToursCents;
  ['transport','food','tips'].forEach(id=>{totalCents+=Math.round(values[id]*100);});
  ['hotel','missing-night','park'].forEach(id=>{totalCents+=Math.round(values[id]*100)/2;});
  if(byId('add-flights').checked){totalCents+=41800;extras.push('黄石两段旧机票$418');}
  if(byId('add-shuttle').checked){totalCents+=20345;extras.push('黄石机场往返$203.45');}
  if(byId('add-maxtour').checked){totalCents+=16200;extras.push('纳瓦霍项目$162');}
  byId('total').textContent=usd(totalCents/100);
  byId('total-note').textContent=`含14日晚${usd(values['missing-night']/2)}/人和年卡${usd(values.park/2)}/人；${totalCents<=650000?'在$6,500目标内。':'高于$6,500目标'+usd((totalCents-650000)/100)+'。'}未勾选补项不再重复加。`;
  byId('extra-note').textContent=extras.length?'本次另计（每人）：'+extras.join('；')+'。':'';
 }
 ids.forEach(id=>byId(id).addEventListener('input',update));
 ids.filter(id=>byId(id).type==='checkbox'||byId(id).tagName==='SELECT').forEach(id=>byId(id).addEventListener('change',update));
 update();
})();
