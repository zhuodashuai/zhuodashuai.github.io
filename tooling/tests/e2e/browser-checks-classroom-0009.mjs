import { createHash } from 'node:crypto';

// Read-only browser checks for the exact independently approved fifteen-head fixture.
const SELECTED=Object.freeze(["worrisome","feasible","preemptively","nominate","conceive","determinant","stigma","squabble","litigator","sustenance","forestall","disclose","antiquated","unsettling","palpitation"]);
const CANONICAL=Object.freeze([]);
const HASH = /^[a-f0-9]{64}$/u;
const SOURCE = '原创学习例句';
const jsonHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const must = (value, message) => { if (!value) throw Error('Seven-head fixture: ' + message); };
const identity = context => JSON.stringify([context.term, context.partOfSpeech, context.meaning]);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const exactHeads = (actual, expected) => same([...actual].sort(), [...expected].sort());
const contextsFromDTO = dto => dto.senses.map(sense => ({ term: dto.term,
  partOfSpeech: sense.partOfSpeech, meaning: sense.meaningZh, kind: 'original-DTO-sense' }));
const uniqueContexts = contexts => [...new Map(contexts.map(c => [identity(c), c])).values()];

export const requiredRegressions = Object.freeze([
  Object.freeze({ query: '获得', term: 'get' }),
  Object.freeze({ query: '赢得', term: 'win' }),
  Object.freeze({ query: '急剧下降', term: 'sink like a stone' }),
  Object.freeze({query:'指定受益人',term:'named beneficiary'}),
  Object.freeze({query:'被指定的受益人',term:'named beneficiary'}),
]);

export function prepareClassroomFixture(fixture) {
 must(fixture?.schemaVersion===1&&fixture.kind==='classroom-fifteen-selected-browser-fixture-0009','exact fixture kind');
 must(jsonHash(fixture.selectedSource)==='b3efa851afdf0649c77719cc22a7531c70109b1773be0c01326b9a455bcfd14d','approved source pin');
 must(fixture.pins.selectedReviewSha256==='3fca02eaa8f0878cc3dfce50c481233612bd038986dcc74da4da1909aa78670e','different reader pin');
 must(exactHeads(fixture.rows.map(r=>r.term),SELECTED)&&fixture.rows.length===15,'fifteen exact heads');
 const rows=fixture.rows.map(input=>{const entry=input.sourceEntry,record=input.canonicalRecord;
  must(input.route==='selected'&&SELECTED.includes(input.term)&&entry.term===input.term,'exact selected route');
  must(jsonHash(entry)===input.sourceEntrySha256&&same(entry,fixture.selectedSource.entries.find(e=>e.term===input.term)),'complete source row');
  must(record.id===entry.canonicalId&&record.term===entry.term&&jsonHash(record)===entry.canonicalSourceSha256,'complete raw owner');
  must(input.originalDTO.term===input.term&&jsonHash(input.originalDTO)===input.originalDTOSha256,'complete original DTO');
  must(same(input.canonicalContexts[0],{term:input.term,partOfSpeech:record.partOfSpeech,meaning:record.meaning}),'original full context');
  const primary={term:input.term,partOfSpeech:entry.partOfSpeech,meaning:entry.meaning,source:'卓式词典·义项补充',license:'Original composition',url:'https://zhuodashuai.github.io/vocab/'};
  const acceptedContexts=[{term:input.term,partOfSpeech:entry.partOfSpeech,meaning:entry.meaning,kind:'exact-selected-context'}];
  const rejectedContexts=uniqueContexts([...input.legacyDisplayContexts.map(c=>({...c,kind:'complete-old-main-or-variant-context'})),...contextsFromDTO(input.originalDTO),{term:input.term,partOfSpeech:'interjection',meaning:entry.meaning,kind:'wrong-POS'},{term:input.term,partOfSpeech:entry.partOfSpeech,meaning:'A personal different sense.',kind:'different-personal-meaning'}]);
  must(rejectedContexts.every(c=>!acceptedContexts.some(x=>identity(x)===identity(c))),'disjoint accepted/rejected contexts');
  const queries=[{kind:'literal',query:input.term},...entry.englishForms.map(query=>({kind:'declared-form',query})),...entry.chineseAliases.map(query=>({kind:'approved-Chinese-alias',query}))];
  return{term:input.term,route:'selected',primary,example:{partOfSpeech:entry.partOfSpeech,meaning:entry.meaning,pairs:[{en:entry.en,zh:entry.zh}]},queries,canonicalRecord:record,originalDTO:input.originalDTO,legacyContexts:input.canonicalContexts,acceptedContexts,rejectedContexts};
 });
 const queryCount=rows.reduce((n,r)=>n+r.queries.length,0);must(queryCount===74,'all74 queries');
 must(fixture.selectedSource.entries.reduce((n,e)=>n+e.englishForms.length,0)===16,'all16 forms');must(fixture.selectedSource.entries.reduce((n,e)=>n+e.chineseAliases.length,0)===43,'all43 Chinese aliases');
 return{rows,pins:fixture.pins,queryCount,selectedQueryCount:74,acceptedSavedChecks:30,rejectedSavedChecks:rows.reduce((n,r)=>n+r.rejectedContexts.length*2,0)};
}

export function freshClassroomReport() {
  return { queries: [], regressions: [], native: [], originals: [], savedAccepted: [], savedRejected: [],
    writes: [], external: [], api: [], providers: [], auth: [], nonStatic: [], queryLeaks: [], errors: [], requestCount: 0 };
}

// This is an allow/observe guard, never a mock dictionary or an API client.
export async function watchAnonymousStaticContext(context, base, report, expect) {
  const origin = new URL(base).origin;
  expect(await context.cookies(base), 'Use a fresh anonymous context').toEqual([]);
  const classify = request => {
    const url = new URL(request.url()), headers = request.headers();
    return { url, writes: !['GET', 'HEAD'].includes(request.method()), external: url.origin !== origin,
      api: /(?:^|\/)(?:api|private|auth)(?:\/|$)/iu.test(url.pathname),
      providers: /openai|anthropic|mymemory|languagetool|dictionaryapi|\/api\/v1\/(?:ai|enrich|translate|attribution)/iu.test(url.href),
      auth: Boolean(url.username || url.password || ['cookie', 'authorization', 'x-wordbook-auth', 'x-csrf-token'].some(k => headers[k])),
      nonStatic: !/\.(?:html?|m?js|css|json|gz|bin|webmanifest|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|map)$/iu.test(url.pathname),
      queryLeaks: ['q', 'query', 'term', 'word', 'lookup', 'auth', 'token', 'csrf'].some(k => url.searchParams.has(k)) };
  };
  context.on('request', request => {
    const flags = classify(request); report.requestCount++;
    for (const key of ['writes', 'external', 'api', 'providers', 'auth', 'nonStatic', 'queryLeaks'])
      if (flags[key]) report[key].push({ method: request.method(), url: request.url() });
  });
  await context.route('**/*', route => {
    const flags = classify(route.request());
    return Object.entries(flags).some(([key, value]) => key !== 'url' && value)
      ? route.abort('blockedbyclient') : route.continue();
  });
}

async function queryFirst(page, query, term, expect) {
  await page.locator('#dictionary-query').fill(query);
  await page.locator('#dictionary-query').press('Enter');
  await expect.poll(() => page.evaluate(() => new URLSearchParams(location.hash.slice(1)).get('q'))).toBe(query);
  await expect(page.locator('#dictionary-status')).toHaveAttribute('data-phase', 'ready', { timeout: 20000 });
  // Every query checks the first displayed result. Never select a candidate.
  await expect(page.locator('#dictionary-term'), 'First hit for ' + query).toHaveText(term);
}

async function assertNoOverflow(page, expect, context) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), context).toBe(true);
  for (const selector of ['#dictionary-meaning', '#dictionary-example-content'])
    expect(await page.locator(selector).evaluate(n => n.scrollWidth <= n.clientWidth + 1), context + ' ' + selector).toBe(true);
}

async function verifyNativeAndOriginals(page, rows, modules) {
  return page.evaluate(async ({ rows, modules }) => {
    const moduleURL = path => new URL(path, document.baseURI).href;
    const [{ lookupPersonalDictionaryFast }, hot, expanded, examples, { createAdditiveExamplesLoader }, { dictionaryExamplesRelease }] = await Promise.all([
      import(moduleURL(modules.personal)), import(moduleURL(modules.hotDictionary)), import(moduleURL(modules.expanded)),
      import(moduleURL(modules.examples)), import(moduleURL(modules.additive)), import(moduleURL(modules.release)),
    ]);
    const reads = [], selected = [], canonical = [], originals = [];
    const nativeProjections=[];
    let selectedFallbackCalls = 0, hotLookupCalls = 0, fullSearchCalls = 0, hotReverseCalls = 0;
    const staticFetch = async (input, options = {}) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, document.baseURI);
      if (url.origin !== location.origin || !['GET', 'HEAD'].includes(options.method || 'GET')
        || /(?:^|\/)(?:api|private|auth)(?:\/|$)/iu.test(url.pathname)) throw Error('Non-public native dictionary request');
      reads.push(url.href); return fetch(url, { ...options, credentials: 'omit' });
    };
    const forbidden = () => { selectedFallbackCalls++; throw Error('A selected lookup reached a fallback'); };
    const pairCheck = (entry, row) => {
      if (!entry || entry.term !== row.term || entry.senses.length !== 1) throw Error('Native example missing ' + row.term);
      const sense = entry.senses[0];
      if (sense.partOfSpeech !== row.example.partOfSpeech || sense.meaningZh !== row.example.meaning || sense.source !== '原创学习例句'
        || JSON.stringify(sense.examples) !== JSON.stringify(row.example.pairs)) throw Error('Native example identity mismatch ' + row.term);
    };
    const firstCheck = (result, row, query, expected = row.primary) => {
      const first = result?.results?.[0];
      for (const key of Object.keys(expected))
        if (first?.[key] !== expected[key]) throw Error('Native first-hit ' + key + ' mismatch: ' + query);
      return first;
    };
    try {
      for (const row of rows.filter(r => r.route === 'selected')) for (const q of row.queries) {
        const result = await lookupPersonalDictionaryFast(q.query, { hotLookup: forbidden, hotReverse: forbidden, fullSearch: forbidden });
        const first = firstCheck(result, row, q.query), card = { ...first, example: 'Existing native saved example.', study: { box: 3, correct: 2 } };
        const before = JSON.stringify(card), entry = await examples.loadDictionaryExamples(row.term, { savedEntry: card, fetchImpl: staticFetch });
        pairCheck(entry, row); if (JSON.stringify(card) !== before) throw Error('Native selected card mutated');
        selected.push({ query: q.query, kind: q.kind, term: first.term, firstHit: true, pair: entry.senses[0].examples, unchanged: true });
      }
      // These are the actual native personal dependencies; no response is stubbed.
      hot.resetPersonalDictionaryCacheForTests?.(); expanded.resetExpandedDictionaryCacheForTests?.();
      for (const row of rows.filter(r => r.route === 'canonical')) {
        for(const kind of ['hot','full']){
          const native=kind==='hot'?await hot.lookupPersonalDictionary(row.term,{fetchImpl:staticFetch}):(await expanded.searchExpandedDictionary(row.term,{fetchImpl:staticFetch})).results[0];
          const expected=row.nativeProjections.find(p=>p.kind===kind).result;
          if(expected===null){if(native!==null)throw Error('Native missing-head changed '+row.term);}
          else{
            if(JSON.stringify(Object.keys(native).sort())!==JSON.stringify(Object.keys(expected).sort())||JSON.stringify(native)!==JSON.stringify(expected))throw Error('Native direct source tuple changed '+row.term+' '+kind);
            const card={...native,example:'Preserve native example.',bookPassage:'Preserve native book.',study:{box:5}},before=JSON.stringify(card);
            pairCheck(await examples.loadDictionaryExamples(row.term,{savedEntry:card,fetchImpl:staticFetch}),row);
            if(JSON.stringify(card)!==before)throw Error('Direct native card mutated');
          }
          nativeProjections.push({term:row.term,kind,missing:native===null,unchanged:true});
        }
        const callsBefore = { hotLookupCalls, fullSearchCalls };
        const result = await lookupPersonalDictionaryFast(row.term, {
          hotLookup: (query, options) => { hotLookupCalls++; return hot.lookupPersonalDictionary(query, { ...options, fetchImpl: staticFetch }); },
          hotReverse: (query, options) => { hotReverseCalls++; return hot.searchPersonalDictionaryChinese(query, { ...options, fetchImpl: staticFetch }); },
          fullSearch: (query, options) => { fullSearchCalls++; return expanded.searchExpandedDictionary(query, { ...options, fetchImpl: staticFetch }); },
        });
        const alternatives=row.nativeProjections.filter(p=>p.kind!=='fast'&&p.result!==null).map(p=>p.result);
        const first=result.results[0];
        if(!alternatives.some(p=>JSON.stringify(Object.keys(first).sort())===JSON.stringify(Object.keys(p).sort())&&JSON.stringify(first)===JSON.stringify(p)))throw Error('Unexpected actual native tuple '+row.term);
        const card = { ...first, example: 'Keep native original sentence.', study: { box: 4, correct: 7 } };
        const before = JSON.stringify(card), entry = await examples.loadDictionaryExamples(row.term, { savedEntry: card, fetchImpl: staticFetch });
        pairCheck(entry, row); if (JSON.stringify(card) !== before) throw Error('Native canonical card mutated');
        canonical.push({ term: first.term, partOfSpeech: first.partOfSpeech, meaning: first.meaning, source: first.source,
          hotLookupCalls: hotLookupCalls - callsBefore.hotLookupCalls, fullSearchCalls: fullSearchCalls - callsBefore.fullSearchCalls,
          pair: entry.senses[0].examples, unchanged: true });
      }
      const reader = createAdditiveExamplesLoader(dictionaryExamplesRelease, { fetchImpl: staticFetch });
      try { for (const row of rows) originals.push({ term: row.term, dto: await reader.load(row.term, { lookupQuery: row.term }) }); }
      finally { reader.close(); }
      return { selected, canonical, nativeProjections, originals, reads, selectedFallbackCalls, hotLookupCalls, fullSearchCalls, hotReverseCalls };
    } finally { examples.resetDictionaryExamplesCacheForTests(); }
  }, { rows, modules });
}

async function verifySavedContexts(page, rows, modulePath) {
  return page.evaluate(async ({ rows, modulePath }) => {
    const { createDictionaryExamplesSection } = await import(new URL(modulePath, document.baseURI).href);
    const accepted = [], rejected = [];
    for (const row of rows) for (const [eligible, contexts] of [[true, row.acceptedContexts], [false, row.rejectedContexts]])
      for (const context of contexts) for (const meaningShape of ['string', 'nested']) {
        const root = document.createElement('div'), anchor = document.createElement('div'); root.append(anchor); document.body.append(root);
        const originalPairs = row.originalDTO.senses.flatMap(s => s.examples);
        const originalNodes = [...originalPairs.flatMap(p => [p.en, p.zh]), 'Existing saved fixture sentence.', 'Existing saved fixture book passage.']
          .map(text => { const p = document.createElement('p'); p.textContent = text; root.append(p); return p; });
        const originalText = originalNodes.map(p => p.textContent);
        const card = { id: 'seven-head-saved-fixture-' + row.term, term: row.term, partOfSpeech: context.partOfSpeech,
          meaning: meaningShape === 'nested' ? { zh: context.meaning } : context.meaning,
          examples: structuredClone(originalPairs), example: originalText.at(-2), bookPassage: originalText.at(-1),
          note: 'Preserve this saved note.', study: { box: 4, correct: 7, incorrect: 2 },
          review: { dueAt: '2026-11-01T12:00:00.000Z', intervalDays: 9 }, progress: { streak: 3 } };
        const before = JSON.stringify(card), section = createDictionaryExamplesSection({ root: document, after: anchor });
        try {
          await section.show(card);
          const ens = [...section.section.querySelectorAll('p[lang=en]')].map(p => p.textContent);
          const zhs = [...section.section.querySelectorAll('p[lang="zh-CN"]')].map(p => p.textContent);
          const pairs = ens.map((en, i) => ({ en, zh: zhs[i] }));
          const result = { term: row.term, route: row.route, kind: context.kind, meaningShape, context,
            unchanged: before === JSON.stringify(card), originalTextUnchanged: JSON.stringify(originalText) === JSON.stringify(originalNodes.map(p => p.textContent)),
            hidden: section.section.hidden, source: section.section.querySelector('.dictionary-learning-source')?.textContent,
            noOverflow: document.documentElement.scrollWidth <= innerWidth + 1
              && section.section.scrollWidth <= section.section.clientWidth + 1,
            labels: [...section.section.querySelectorAll('.dictionary-learning-sense h4')].map(p => p.textContent), pairs,
            newPairAbsent: row.example.pairs.every(p => !ens.includes(p.en) && !zhs.includes(p.zh)),
            onlyOriginalPairs: pairs.every(p => originalPairs.some(old => old.en === p.en && old.zh === p.zh)) };
          (eligible ? accepted : rejected).push(result);
        } finally { section.clear(); root.remove(); }
      }
    return { accepted, rejected };
  }, { rows, modulePath });
}

export function assertClassroomTraffic(expect, report) {
  for (const key of ['writes', 'external', 'api', 'providers', 'auth', 'nonStatic', 'queryLeaks', 'errors'])
    expect(report[key], 'Forbidden traffic or page error: ' + key).toEqual([]);
}

export async function verifyClassroomViewport({ context, base, fixture, modules, expect, report, width }) {
  must([390, 1280].includes(width), 'viewport must be 390 or 1280');
  const prepared = prepareClassroomFixture(fixture), rows = prepared.rows;
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push({ base, width, message: error.message }));
  try {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(new URL('dictionary.html', base).href, { waitUntil: 'domcontentloaded' });
    for (const row of rows) for (const q of row.queries) {
      await queryFirst(page, q.query, row.term, expect);
      await expect(page.locator('#dictionary-pos')).toHaveText(row.primary.partOfSpeech);
      await expect(page.locator('#dictionary-meaning .meaning-line')).toHaveText(row.primary.meaning.split('\n'));
      await expect(page.locator('#dictionary-source a')).toHaveText(row.primary.source);
      await expect(page.locator('#dictionary-source a')).toHaveAttribute('href', row.primary.url);
      await expect(page.locator('#dictionary-source')).toHaveText('来源：' + row.primary.source + ' · ' + row.primary.license);
      await expect(page.locator('#dictionary-example-panel')).toBeVisible({ timeout: 20000 });
      const details = page.locator('#dictionary-example-content details'); await expect(details).toHaveCount(1, { timeout: 20000 });
      await expect(details.locator('summary')).toHaveText('1. ' + row.example.partOfSpeech + ' · ' + row.example.meaning);
      if (!await details.evaluate(node => node.open)) await details.locator('summary').click();
      await expect(details.locator('p[lang=en]')).toHaveText(row.example.pairs.map(p => p.en));
      await expect(details.locator('p[lang="zh-CN"]')).toHaveText(row.example.pairs.map(p => p.zh));
      await expect(page.locator('#dictionary-example-source')).toHaveText(SOURCE);
      await assertNoOverflow(page, expect, q.query);
      report.queries.push({ base, width, route: row.route, ...q, term: row.term, firstHit: true, candidateClicked: false,
        partOfSpeech: row.primary.partOfSpeech, meaning: row.primary.meaning, source: row.primary.source, pairs: row.example.pairs });
    }
    for (const guard of requiredRegressions) {
      await queryFirst(page, guard.query, guard.term, expect);
      await assertNoOverflow(page, expect, guard.query);
      report.regressions.push({ base, width, ...guard, firstHit: true, candidateClicked: false });
    }
    const native = await verifyNativeAndOriginals(page, rows, modules);
    expect(native.selected).toHaveLength(prepared.selectedQueryCount); expect(native.canonical).toHaveLength(0);
    expect(native.selectedFallbackCalls).toBe(0); expect(native.hotLookupCalls).toBe(0); expect(native.fullSearchCalls).toBe(0);
    expect(native.hotReverseCalls).toBe(0); expect(native.reads.length).toBeGreaterThan(0);
    for (const result of native.canonical) { expect(result.hotLookupCalls).toBe(1); expect(result.fullSearchCalls).toBe(1); }
    expect(native.originals).toHaveLength(15); expect(native.nativeProjections).toHaveLength(0);
    for (const original of native.originals) expect(original.dto, 'Original DTO retained: ' + original.term).toEqual(rows.find(r => r.term === original.term).originalDTO);
    report.originals.push({ base, width, checks: native.originals }); delete native.originals;
    report.native.push({ base, width, ...native });
    const saved = await verifySavedContexts(page, rows, modules.examplesUI);
    expect(saved.accepted).toHaveLength(prepared.acceptedSavedChecks); expect(saved.rejected).toHaveLength(prepared.rejectedSavedChecks);
    for (const result of [...saved.accepted, ...saved.rejected]) {
      expect(result.unchanged && result.originalTextUnchanged, 'Saved fields/original passages unchanged: ' + result.term).toBe(true);
      expect(result.noOverflow, 'Saved-card layout fits: ' + result.term).toBe(true);
    }
    for (const result of saved.accepted) {
      const row = rows.find(r => r.term === result.term); expect(result.hidden).toBe(false); expect(result.source).toBe(SOURCE);
      expect(result.labels).toEqual([row.example.partOfSpeech + ' · ' + row.example.meaning]); expect(result.pairs).toEqual(row.example.pairs);
    }
    for (const result of saved.rejected) {
      expect(result.newPairAbsent && result.onlyOriginalPairs, 'No new pair on an old/different saved sense: ' + result.term).toBe(true);
      const row = rows.find(r => r.term === result.term);
      if (row.legacyContexts.some(c => c.partOfSpeech === result.context.partOfSpeech && c.meaning === result.context.meaning)) {
        expect(result.hidden, 'Exact historic cards keep all old examples: ' + result.term).toBe(false);
        expect(result.labels).toEqual(row.originalDTO.senses.map(s => s.partOfSpeech + ' · ' + s.meaningZh));
        expect(result.pairs).toEqual(row.originalDTO.senses.flatMap(s => s.examples));
      }
      if (result.route === 'canonical') { expect(result.hidden).toBe(true); expect(result.pairs).toEqual([]); }
    }
    report.savedAccepted.push({ base, width, checks: saved.accepted }); report.savedRejected.push({ base, width, checks: saved.rejected });
    expect(report.queries).toHaveLength(prepared.queryCount); expect(report.regressions).toHaveLength(5);
    expect(await context.cookies(base), 'Static reading remains anonymous').toEqual([]);
    assertClassroomTraffic(expect, report);
  } finally { await page.close(); }
}
