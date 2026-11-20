import {expect} from '@playwright/test';

// Opt in only from fixtures whose contract is the complete recorded source
// chapter, including an earlier word reused in a later chapter. This is the
// ordinary documented view preference, not a data or quiz API bypass.
export function useRecordedChapterSources(test) {
  test.beforeEach(async({context})=>{
    await context.addInitScript(()=>{
      localStorage.setItem('wordbook:show-repeated-reading-cards:v1','true');
    });
  });
}

export async function showRecordedChapterSources(page,{defaultCount,recordedCount}) {
  const toggle=page.locator('#show-repeated-reading-cards');
  await expect(toggle).not.toBeChecked();
  await expect(page.locator('#entry-count')).toHaveText(String(defaultCount));
  const options=page.locator('#library-options'),wasOpen=await options.evaluate(node=>node.open);
  if(!wasOpen)await options.locator(':scope > summary').click();
  await toggle.check();await expect(toggle).toBeChecked();
  await expect(page.locator('#entry-count')).toHaveText(String(recordedCount));
  if(!wasOpen)await options.locator(':scope > summary').click();
  await expect(options).toHaveJSProperty('open',wasOpen);
}
