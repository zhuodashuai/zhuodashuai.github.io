import {test,expect} from '@playwright/test';

test.use({serviceWorkers:'block',storageState:{cookies:[],origins:[]}});

async function staticOnly(context,baseURL){
  const forbidden=[],origin=new URL(baseURL).origin;
  await context.route('**/*',route=>{
    const request=route.request(),url=new URL(request.url());
    const unsafe=url.origin!==origin||request.method()!=='GET'||/^\/(?:api|auth)(?:\/|$)/u.test(url.pathname)
      ||['q','query','text','term','word'].some(key=>url.searchParams.has(key));
    if(unsafe){forbidden.push({method:request.method(),url:url.href});return route.abort();}
    return route.continue();
  });
  return async()=>{expect(forbidden).toEqual([]);expect(await context.cookies()).toEqual([]);};
}

async function query(page,value){
  await page.locator('#dictionary-query').fill(value);await page.locator('#dictionary-query').press('Enter');
  await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase','ready');
  await expect(page.locator('#dictionary-result')).toBeVisible();
}

for(const width of[390,1280]){
  test(`search stays available and an edited input keeps a labelled, noncollectable old card at ${width}px`,async({context,page,baseURL})=>{
    const finish=await staticOnly(context,baseURL);await page.setViewportSize({width,height:844});
    await page.goto('/dictionary.html');await query(page,'happy');
    const original=await page.locator('#dictionary-meaning').textContent();
    await page.locator('#dictionary-query').fill('happ');
    await expect(page.locator('#dictionary-result')).toBeVisible();await expect(page.locator('#dictionary-term')).toHaveText('happy');
    await expect(page.locator('#dictionary-display-context')).toContainText('happy');
    await expect(page.locator('#dictionary-add')).not.toHaveAttribute('href');await expect(page.locator('#dictionary-add')).toHaveAttribute('aria-disabled','true');
    expect(await page.locator('#dictionary-meaning').textContent()).toBe(original);
    await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
    const geometry=await page.evaluate(()=>{
      const input=document.getElementById('dictionary-query').getBoundingClientRect(),header=document.querySelector('.app-header').getBoundingClientRect();
      return{inputTop:input.top,inputBottom:input.bottom,headerBottom:header.bottom,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1};
    });
    expect(geometry.inputTop).toBeGreaterThanOrEqual(geometry.headerBottom-1);expect(geometry.inputBottom).toBeLessThan(geometry.height);expect(geometry.overflow).toBe(false);
    await page.locator('#dictionary-clear').click();await expect(page.locator('#dictionary-query')).toHaveValue('');await expect(page.locator('#dictionary-result')).toBeHidden();
    await page.goBack();await expect(page.locator('#dictionary-query')).toHaveValue('happy');await expect(page.locator('#dictionary-term')).toHaveText('happy');
    await expect(page.locator('#dictionary-add')).toHaveAttribute('href',/#lookup=happy$/u);
    await page.goForward();await expect(page.locator('#dictionary-query')).toHaveValue('');await expect(page.locator('#dictionary-result')).toBeHidden();
    await finish();
  });

  test(`Back and Forward restore completed queries without duplicate history or a cancelled query taking over at ${width}px`,async({context,page,baseURL})=>{
    test.setTimeout(45000);const finish=await staticOnly(context,baseURL);await page.setViewportSize({width,height:844});
    await page.goto('/dictionary.html#q=happy');await expect(page.locator('#dictionary-term')).toHaveText('happy');
    const initialLength=await page.evaluate(()=>history.length);
    await query(page,'calm');expect(await page.evaluate(()=>history.length)).toBe(initialLength+1);
    await query(page,'calm');expect(await page.evaluate(()=>history.length)).toBe(initialLength+1);
    let release,observed;const started=new Promise(resolve=>{observed=resolve;}),held=new Promise(resolve=>{release=resolve;});
    let waiting=true;
    await page.route('**/data/expanded-dictionary/**/en-*.json',async route=>{
      if(waiting){waiting=false;observed();await held;}
      try{await route.continue();}catch{/* The query was deliberately cancelled by history navigation. */}
    });
    await page.locator('#dictionary-query').fill('abacus');await page.locator('#dictionary-query').press('Enter');
    await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(Error('The cold query did not reach its actual source shard')),10000))]);
    await page.goBack();await expect(page.locator('#dictionary-query')).toHaveValue('happy');await expect(page.locator('#dictionary-term')).toHaveText('happy');
    release();await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase','ready');
    await expect(page.locator('#dictionary-add')).toHaveAttribute('href',/#lookup=happy$/u);await expect(page).toHaveURL(/#q=happy$/u);
    await page.goForward();await expect(page.locator('#dictionary-query')).toHaveValue('calm');await expect(page.locator('#dictionary-term')).toHaveText('calm');
    expect(await page.evaluate(()=>history.length)).toBe(initialLength+1);await finish();
  });

  test(`Chinese misses use keyword recovery and an unknown English phrase offers literal word references at ${width}px`,async({context,page,baseURL})=>{
    const finish=await staticOnly(context,baseURL);await page.setViewportSize({width,height:844});let spellingRequests=0;
    page.on('request',request=>{if(new URL(request.url()).pathname.endsWith('/dictionary-suggestions.js'))spellingRequests++;});
    await page.goto('/dictionary.html');await page.locator('#dictionary-query').fill('没有收录的测试词云鹤');await page.locator('#dictionary-query').press('Enter');
    await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase','empty');
    await expect(page.locator('#dictionary-status')).toContainText('中文关键词');await expect(page.locator('#dictionary-suggestion-panel')).toBeHidden();
    expect(spellingRequests).toBe(0);await expect(page.locator('#dictionary-recovery')).toBeVisible();
    await page.locator('#dictionary-edit-query').click();await expect(page.locator('#dictionary-query')).toBeFocused();
    await page.locator('#dictionary-query').fill('unlisted lantern phrase');await page.locator('#dictionary-query').press('Enter');
    await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase','empty');
    await expect(page.locator('#dictionary-component-title')).toContainText('不代表整句翻译');
    await expect(page.locator('#dictionary-query')).toHaveValue('unlisted lantern phrase');
    await expect(page.locator('#dictionary-components button')).toHaveText(['unlisted','lantern','phrase']);
    await page.locator('#dictionary-components button').filter({hasText:/^lantern$/u}).click();
    await expect(page.locator('#dictionary-term')).toHaveText('lantern');await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase','ready');
    await finish();
  });

  test(`formatted typos reach real suggestions while Chinese and unsafe input keep the sidecar unloaded at ${width}px`,async({context,page,baseURL},info)=>{
    const finish=await staticOnly(context,baseURL);await page.setViewportSize({width,height:844});let spellingRequests=0;
    page.on('request',request=>{if(new URL(request.url()).pathname.endsWith('/dictionary-suggestions.js'))spellingRequests++;});
    await page.goto('/dictionary.html');
    for(const input of ['没有收录的测试词云鹤','<script>heppy</script>','heppy\u202e','a']){
      await page.locator('#dictionary-query').fill(input);await page.locator('#dictionary-query').press('Enter');
      await expect(page.locator('#dictionary-status')).not.toHaveAttribute('data-phase','loading');
      await expect(page.locator('#dictionary-suggestion-panel')).toBeHidden();expect(spellingRequests).toBe(0);
    }
    for(const[input,target]of [['heppy!','happy'],['heppy?','happy'],['he\u200bppy','happy'],['“heppy”','happy'],['donʼtt',"don't"],['charging calbe?','charging cable']]){
      await page.locator('#dictionary-query').fill(input);await page.locator('#dictionary-query').press('Enter');
      await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase','empty');
      await expect(page.locator('#dictionary-suggestions button').filter({hasText:new RegExp(`^${target}$`,'u')})).toBeVisible();
      await expect(page.locator('#dictionary-query')).toHaveValue(input);await expect(page.locator('#dictionary-result')).toBeHidden();
      expect(decodeURIComponent(new URL(page.url()).hash.slice(3))).toBe(input);
    }
    expect(spellingRequests).toBe(1);await page.screenshot({path:info.outputPath(`formatted-typo-${width}.png`),fullPage:true});await finish();
  });

  test(`wrapped PDF fragments preserve their raw query through lookup and history at ${width}px`,async({context,page,baseURL})=>{
    const finish=await staticOnly(context,baseURL);await page.setViewportSize({width,height:844});let spellingRequests=0;
    page.on('request',request=>{if(new URL(request.url()).pathname.endsWith('/dictionary-suggestions.js'))spellingRequests++;});
    const copied='accom-\nmodation';
    await page.goto(`/dictionary.html#q=${encodeURIComponent(copied)}`);
    await expect(page.locator('#dictionary-term')).toHaveText('accommodation');
    await expect(page.locator('#dictionary-query')).toHaveValue('accom- modation');
    expect(decodeURIComponent(new URL(page.url()).hash.slice(3))).toBe(copied);
    await query(page,'happy');await page.goBack();
    await expect(page.locator('#dictionary-term')).toHaveText('accommodation');
    await expect(page.locator('#dictionary-query')).toHaveValue('accom- modation');
    expect(decodeURIComponent(new URL(page.url()).hash.slice(3))).toBe(copied);
    await page.goForward();await expect(page.locator('#dictionary-term')).toHaveText('happy');
    expect(spellingRequests).toBe(0);await finish();
  });

  test(`candidate expansion stays bounded and a short viewport leaves the search and definition reachable at ${width}px`,async({context,page,baseURL})=>{
    const finish=await staticOnly(context,baseURL);await page.setViewportSize({width,height:844});await page.goto('/dictionary.html');await query(page,'开心');
    const disclosure=page.locator('#dictionary-choice-disclosure');
    if(width===390){await expect(disclosure).not.toHaveAttribute('open');await disclosure.locator('summary').click();}
    const size=await page.locator('#dictionary-choices').evaluate(node=>node.getBoundingClientRect().height);
    if(width===390){expect(size).toBeLessThanOrEqual(193);expect(await page.locator('#dictionary-term').evaluate(node=>node.getBoundingClientRect().top)).toBeLessThan(700);}
    await page.setViewportSize({width,height:460});await page.locator('#dictionary-query').fill('calm');await page.locator('#dictionary-query').press('Enter');
    await expect(page.locator('#dictionary-term')).toHaveText('calm');
    const input=await page.locator('#dictionary-query').boundingBox();expect(input.y).toBeGreaterThanOrEqual(0);expect(input.y+input.height).toBeLessThan(460);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await finish();
  });
}
