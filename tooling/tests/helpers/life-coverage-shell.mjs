import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Authenticate complete current118/public121 snapshots before reversing only
// the declared entry URLs. Every prior117 shell/body pin remains unchanged.
const entries=new Map([
  [
    "index.html",
    {
      "pins": [
        [
          14536,
          "b9559896feabddcce2aa0442421aaa926db1c50995b20db0c5f0e702b867c610"
        ],
        [
          14660,
          "fa7eed5a8a55e2810694955000ecfa114b016f4f046786c71730e2774d63e546"
        ]
      ],
      "current": "src=\"js/public-app-v113.js?v=121\"",
      "previous": "src=\"js/public-app-v113.js?v=120\""
    }
  ],
  [
    "dictionary.html",
    {
      "pins": [
        [
          7911,
          "100c753ef52746af9e2d4c49043261bddb198af9215888021b2427be0a23da52"
        ],
        [
          8011,
          "5a3fb96d59b57db07f59c5d3e652c7c0c66499a0f4129993c7487dca25180af9"
        ]
      ],
      "current": "src=\"js/dictionary-entry-v109.js?v=118\"",
      "previous": "src=\"js/dictionary-entry-v109.js?v=117\""
    }
  ],
  [
    "owner.html",
    {
      "pins": [
        [
          12864,
          "bd8848c537bdf01d6b192ff5f3692e5edb137bc44d7da3da947a4d4f981e2343"
        ],
        [
          12913,
          "536e6dba47a54c53701307c44c69a88dab04441c7d7a6c880dff289ef100617f"
        ]
      ],
      "current": "src=\"js/owner-app-v108.js?v=118\"",
      "previous": "src=\"js/owner-app-v108.js?v=117\""
    }
  ],
  [
    "personal.html",
    {
      "pins": [
        [
          23743,
          "cbea026917b2f4a82d8e2c9a75bb4795af0326660d8c9715683602cc8a191ee9"
        ],
        [
          23843,
          "c61f2fe6f2e12657012c5ec468d0f31d19ffa133ae3ca456808723880688ef43"
        ]
      ],
      "current": "src=\"js/personal-app-v108.js?v=118\"",
      "previous": "src=\"js/personal-app-v108.js?v=117\""
    }
  ]
]);
export const LIFE_COVERAGE_URLS=Object.freeze([
  "./js/public-app-v113.js?v=121",
  "./js/personal-app-v108.js?v=118",
  "./js/owner-app-v108.js?v=118",
  "./js/dictionary-entry-v109.js?v=118",
  "./js/dictionary-app-v109.js?v=118",
  "./js/dictionary-app.js?v=118",
  "./js/library-lookup-controller.js?v=118",
  "./js/library-lookup-ui.js?v=118",
  "./js/personal-lookup-flow.js?v=118",
  "./js/dictionary-suggestions.js?v=118",
  "./js/expanded-dictionary.js?v=118",
  "./js/english-surface-variants.js?v=118",
  "./js/everyday-lookup.js?v=118",
  "./js/everyday-lookup-data.js?v=118",
  "./js/reviewed-senses-data.js?v=118",
  "./js/search-experience-data.js?v=118",
  "./js/dictionary-examples-current-v4.js?v=118",
  "./js/dictionary-examples-ui-v108.js?v=118",
  "./js/entry-detail-v113.js?v=118",
  "./js/entry-detail-v108.js?v=118",
  "./js/selected-common-sense.js?v=118",
  "./js/selected-legacy-examples.js?v=118",
  "./js/chinese-search.js?v=118",
  "./js/chinese-ranking.js?v=118",
  "./js/chinese-query-cache.js?v=118",
  "./js/chinese-query-cache-release.js?v=118",
  "./js/chinese-query-cache-format.js?v=118",
  "./js/dictionary-offline-warm-v108.js?v=118",
  "./js/dictionary-form-evidence.js?v=118",
  "./js/reviewed-canonical-forms.js?v=118",
  "./js/public-snapshot.js?v=118",
  "./js/english-laundry-phrase-evidence.js?v=118"
]);
const workerPins=[[23358,"837807f7b902654eb0cf96c38af143af99858f017f44c2f910355378cc970eba"],[23781,"4c6c4503718ca009afe7d55291bd0dc0a0ee5002e4ba8b6c304db4d4389bf2fd"]];
function authenticate(text,pins,label){
  const bytes=Buffer.from(text),sha=createHash('sha256').update(bytes).digest('hex');
  assert(pins.some(([length,digest])=>length===bytes.length&&digest===sha),label+': life-coverage shell snapshot changed');
}
export function restoreLifeCoverageShell(file,text){
  const entry=entries.get(file);if(!entry)return text;
  authenticate(text,entry.pins,file);
  assert.equal(text.split(entry.current).length,2,'Exactly one reviewed118 entryURL');
  return text.replace(entry.current,entry.previous);
}
export function restoreLifeCoverageShellIfCurrent(file,text){
  const entry=entries.get(file);
  return entry&&text.includes(entry.current)?restoreLifeCoverageShell(file,text):text;
}
export function restoreLifeCoverageServiceWorkerShell(text){
  authenticate(text,workerPins,'sw.js');
  const eol=text.includes('\r\n')?'\r\n':'\n',anchor='const SHELL = ['+eol;
  const prefix=LIFE_COVERAGE_URLS.map(url=>'  '+JSON.stringify(url)+',').join(eol)+eol+eol;
  assert.equal(text.split(anchor+prefix).length,2,'Exactly one fresh32URL prefix');
  return text.replace(anchor+prefix,anchor);
}
