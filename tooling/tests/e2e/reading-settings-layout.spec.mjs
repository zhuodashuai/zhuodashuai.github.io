import {test,expect} from '@playwright/test';

test.use({serviceWorkers:'block',storageState:{cookies:[],origins:[]}});

for(const viewport of [{width:360,height:640},{width:390,height:844}]){
  test(`mobile reading settings keep the first card visible and preserve the repeated-view choice at ${viewport.width}px`,async({page},info)=>{
    await page.setViewportSize(viewport);await page.goto('/?book=never-let-me-go&chapter=chapter-12');
    const options=page.locator('#library-options'),toggle=options.locator('#show-repeated-reading-cards');
    await expect(page.locator('#entry-count')).toHaveText('23');
    await expect(options).toHaveJSProperty('open',false);await expect(toggle).toBeHidden();
    const firstCardTop=await page.locator('#entry-grid .word-card').first().evaluate(node=>node.getBoundingClientRect().top);
    expect(firstCardTop).toBeLessThan(550);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await info.attach('first-card-layout',{body:JSON.stringify({viewport,firstCardTop}),contentType:'application/json'});
    await page.screenshot({path:info.outputPath(`reading-settings-closed-${viewport.width}.png`),fullPage:false});
    await options.locator(':scope > summary').click();
    await expect(options.locator(':scope > summary')).toHaveText('筛选与设置');await expect(toggle).toBeVisible();
    await page.screenshot({path:info.outputPath(`reading-settings-open-${viewport.width}.png`),fullPage:false});
    await toggle.check();await expect(page.locator('#entry-count')).toHaveText('25');
    await options.locator(':scope > summary').click();await expect(toggle).toBeHidden();
    await page.reload();await expect(page.locator('#entry-count')).toHaveText('25');
    await expect(options).toHaveJSProperty('open',false);await expect(toggle).toBeChecked();
    await options.locator(':scope > summary').click();await expect(toggle).toBeVisible();
    await toggle.uncheck();await expect(page.locator('#entry-count')).toHaveText('23');
    await options.locator(':scope > summary').click();await expect(options).toHaveJSProperty('open',false);
    await page.evaluate(()=>scrollTo(0,0));
    expect(await page.locator('#entry-grid .word-card').first().evaluate(node=>node.getBoundingClientRect().top)).toBeLessThan(550);
  });
}

test('desktop reading settings keep the ordinary view choice immediately available',async({page},info)=>{
  await page.setViewportSize({width:1280,height:900});await page.goto('/?book=never-let-me-go&chapter=chapter-12');
  const options=page.locator('#library-options'),toggle=options.locator('#show-repeated-reading-cards');
  await expect(page.locator('#entry-count')).toHaveText('23');await expect(options).toHaveJSProperty('open',true);
  await expect(toggle).toBeVisible();await toggle.check();await expect(page.locator('#entry-count')).toHaveText('25');
  await toggle.uncheck();await expect(page.locator('#entry-count')).toHaveText('23');
  await expect(options).toHaveJSProperty('open',true);
  await page.screenshot({path:info.outputPath('reading-settings-desktop.png'),fullPage:false});
});
