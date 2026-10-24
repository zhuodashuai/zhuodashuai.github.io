import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
const copies=[
  {
    "oldName": "dictionary-app.js",
    "newName": "dictionary-app-v108.js",
    "replacements": [
      [
        "./dictionary-examples.js?v=96",
        "./dictionary-examples-current-v4.js"
      ]
    ],
    "allowedOldRaw": [
      {
        "bytes": 27904,
        "sha256": "a339ebc6db4d9dd30c850bd738fce561eff1bc05c485d76e7c27cba8b8bd1d5d"
      },
      {
        "bytes": 27482,
        "sha256": "b3f79d355d1525093f11f4c04526b393bedce47760f320dbee4f8c402a7b4702"
      }
    ]
  },
  {
    "oldName": "dictionary-entry.js",
    "newName": "dictionary-entry-v108.js",
    "replacements": [
      [
        "./dictionary-app.js?v=104",
        "./dictionary-app-v108.js"
      ],
      [
        "./dictionary-offline-warm.js?v=102",
        "./dictionary-offline-warm-v108.js"
      ]
    ],
    "allowedOldRaw": [
      {
        "bytes": 707,
        "sha256": "98c34b0adbf0c672cd8f25cdcb58c710d5163c2d6e01b2fe4f6144e7e117fba9"
      },
      {
        "bytes": 693,
        "sha256": "827db615cdb51ea3a51dc52f922e3b0cf8ad72fd1af2338212feb584f984a67f"
      }
    ]
  },
  {
    "oldName": "dictionary-examples-ui.js",
    "newName": "dictionary-examples-ui-v108.js",
    "replacements": [
      [
        "./dictionary-examples.js?v=96",
        "./dictionary-examples-current-v4.js"
      ]
    ],
    "allowedOldRaw": [
      {
        "bytes": 3781,
        "sha256": "d5f3047f2121bac6b6b7fb6eb846cb85f856fa519888d4df74ba45005892f922"
      },
      {
        "bytes": 3704,
        "sha256": "17a2e489872802b82d269dcefee079b3204f60f8bfac6a670c2e3ae5569fa454"
      }
    ]
  },
  {
    "oldName": "entry-detail.js",
    "newName": "entry-detail-v108.js",
    "replacements": [
      [
        "./dictionary-examples-ui.js?v=96",
        "./dictionary-examples-ui-v108.js"
      ]
    ],
    "allowedOldRaw": [
      {
        "bytes": 19123,
        "sha256": "ab354f775e27edd29765a4af0288a9d6b804be941a8da96193cfd2b9c8f9e7ef"
      },
      {
        "bytes": 18752,
        "sha256": "5132a2c0499fcfc525805ede48673d02dc911da05dc9ece19dfce854a5d46c77"
      }
    ]
  },
  {
    "oldName": "public-app.js",
    "newName": "public-app-v108.js",
    "replacements": [
      [
        "./entry-detail.js?v=96",
        "./entry-detail-v108.js"
      ]
    ],
    "allowedOldRaw": [
      {
        "bytes": 42605,
        "sha256": "b6f9ef9457d259cc7cc085058c536c36177c9e8b94f595c2f886f1833d56d1a1"
      },
      {
        "bytes": 41786,
        "sha256": "d2ad956b8fb5c9f0c8ee340d65a39181ca251c239bad262faec269d69e4f9b17"
      }
    ]
  },
  {
    "oldName": "owner-app.js",
    "newName": "owner-app-v108.js",
    "replacements": [
      [
        "./entry-detail.js?v=96",
        "./entry-detail-v108.js"
      ]
    ],
    "allowedOldRaw": [
      {
        "bytes": 99551,
        "sha256": "041f0f2ce9f01b78b1bd3ef4f7f1ccc2503dff83d11da8d4a2a14e421bce3850"
      },
      {
        "bytes": 97555,
        "sha256": "2497f82365080a1f613407f140f4367eeadc9937cde3be377d7b355e881ef5ca"
      }
    ]
  },
  {
    "oldName": "personal-app.js",
    "newName": "personal-app-v108.js",
    "replacements": [
      [
        "./dictionary-examples-ui.js?v=96",
        "./dictionary-examples-ui-v108.js"
      ]
    ],
    "allowedOldRaw": [
      {
        "bytes": 116576,
        "sha256": "69e830f79a25087e4b7029c176aa764678fa6c8e0d9252e504cc8f26cfe2a61f"
      },
      {
        "bytes": 114712,
        "sha256": "910a686162a1cf6b52cf6ab7a436704d81e93086ba73202cbda3316e68868cab"
      }
    ]
  },
  {
    "oldName": "dictionary-offline-warm.js",
    "newName": "dictionary-offline-warm-v108.js",
    "replacements": [],
    "allowedOldRaw": [
      {
        "bytes": 8829,
        "sha256": "9618905728b7d1115fde9cc32308523d962d3e381ed0f6b51b409f81dd3d4e95"
      },
      {
        "bytes": 8655,
        "sha256": "8e3919b396b60675aef13a4bc4547306d8d6a7a350ff8e13c12ea188425bad90"
      }
    ]
  }
];
const html=[
  {
    "file": "vocab/index.html",
    "from": "js/public-app.js?v=104",
    "to": "js/public-app-v108.js",
    "allowedOldRaw": [
      {
        "bytes": 14588,
        "sha256": "3d369ea2063096f7fc9774f1b3f3b35ff07125bc445fc1ad28302af2829550cb"
      },
      {
        "bytes": 14464,
        "sha256": "0fbe6c4bbc02402c6167cfb9d1c03eabf35dcdff9ff714838bd96d214d192520"
      }
    ]
  },
  {
    "file": "vocab/owner.html",
    "from": "js/owner-app.js?v=104",
    "to": "js/owner-app-v108.js",
    "allowedOldRaw": [
      {
        "bytes": 12841,
        "sha256": "e12119f6f07361c8621e9de6629ab8d3f3195afb38f17a2f6ca534fbe0e1a0ac"
      },
      {
        "bytes": 12792,
        "sha256": "4200f5f7fa6ddd0fd9dcf39353f1d37e5526f0fb1c81ec4016571533d8840e76"
      }
    ]
  },
  {
    "file": "vocab/personal.html",
    "from": "js/personal-app.js?v=107",
    "to": "js/personal-app-v108.js",
    "allowedOldRaw": [
      {
        "bytes": 23502,
        "sha256": "ffa3e9ddc2ba67c14f442f5eb909b26c40c4db73600d9a230d9ee7dc3d97a0da"
      },
      {
        "bytes": 23404,
        "sha256": "f6de803cc1328084c98b622c36676bc23f8467fec47b2e35563015b7e1a42371"
      }
    ]
  },
  {
    "file": "vocab/dictionary.html",
    "from": "js/dictionary-entry.js?v=104",
    "to": "js/dictionary-entry-v108.js",
    "allowedOldRaw": [
      {
        "bytes": 7125,
        "sha256": "172d8291795bf1e7bfe6662709c45f0da56766a247132d05d0ef6df2d7fc91af"
      },
      {
        "bytes": 7033,
        "sha256": "1a7be77491d52b66c743c31bb41e6d623676232b12af2f88c518c941bba430bf"
      }
    ]
  }
];
const navigation=[
  {
    "file": "vocab/js/app-navigation.js",
    "allowedSha": [
      "cb995c795591f021bf631690701473be9a4a2af5c321decfaa6436cd926181cc",
      "cb995c795591f021bf631690701473be9a4a2af5c321decfaa6436cd926181cc"
    ]
  },
  {
    "file": "vocab/js/app-navigation-entry.js",
    "allowedSha": [
      "34714ad53014d31d5899dd8f93bf236f4349a70bcfb13537e3fd1c6aef17e9d7",
      "34714ad53014d31d5899dd8f93bf236f4349a70bcfb13537e3fd1c6aef17e9d7"
    ]
  }
];
const warmerAddition="    if (/^data\\/dictionary-examples\\/(?:catalogue-v4|delta-v4)\\/[a-f0-9]{64}\\.bin$/u.test(path)) return url.href;";
for(const item of copies)test('v108 exact mechanical copy keeps old URL/body: '+item.oldName,async()=>{
 const old=await fs.readFile(new URL('vocab/js/'+item.oldName,root)),next=await fs.readFile(new URL('vocab/js/'+item.newName,root));
 assert(item.allowedOldRaw.some(t=>t.bytes===old.length&&t.sha256===sha(old)),'Original body differs from its exact Git/Windows pins');
 let restored=next.toString('utf8');
 for(const[from,to]of item.replacements){assert.equal(restored.split(to).length,2);restored=restored.replace(to,from);}
 if(item.oldName==='dictionary-offline-warm.js'){const eol=old.includes(Buffer.from('\r\n'))?'\r\n':'\n';assert.equal(restored.split(warmerAddition+eol).length,2);restored=restored.replace(warmerAddition+eol,'');}
 assert.deepEqual(Buffer.from(restored),old,'No change beyond the named imports or one strict URL branch');
});
for(const item of html)test('the historical v108 HTML shell is exact after undoing the named v109 startup child: '+item.file,async()=>{
 const current=await fs.readFile(new URL(item.file,root));let text=current.toString();
 if(item.file==='vocab/personal.html'){
  assert.equal(text.split('src="js/app-navigation-ready-v109.js"').length,2);
  assert.equal(text.split('<header class="personal-topbar app-header" inert data-app-navigation-pending>').length,2);
  text=text.replace('src="js/app-navigation-ready-v109.js"','src="js/app-navigation-entry.js?v=107"')
   .replace('<header class="personal-topbar app-header" inert data-app-navigation-pending>','<header class="personal-topbar app-header">');
  for(const[id,mode]of[['member-github-owner-link','owner'],['member-standard-login-link','member']]){
   const gated=`id="${id}" href="personal.html?auth=${mode}" inert data-app-navigation-pending`;
   assert.equal(text.split(gated).length,2);text=text.replace(gated,`id="${id}" href="personal.html?auth=${mode}"`);
  }
 }
 if(item.file==='vocab/dictionary.html'){
  assert.equal(text.split('src="js/dictionary-entry-v109.js"').length,2);
  assert.equal(text.split('<button id="dictionary-submit" type="submit" disabled>准备中…</button>').length,2);
  text=text.replace('src="js/dictionary-entry-v109.js"','src="js/dictionary-entry-v108.js"')
   .replace('<button id="dictionary-submit" type="submit" disabled>准备中…</button>','<button id="dictionary-submit" type="submit">查词</button>');
 }
 assert.equal(text.split('src="'+item.to+'"').length,2);assert(!text.includes('src="'+item.from+'"'));
 const restored=Buffer.from(text.replace('src="'+item.to+'"','src="'+item.from+'"'));
 assert(item.allowedOldRaw.some(t=>t.bytes===restored.length&&t.sha256===sha(restored)));
 assert(text.includes('src="js/app-navigation-entry.js?v=107"'));
});

test('the fresh v109 application adds only the readiness adoption after listeners and preserves the whole v108 body',async()=>{
 const before=(await fs.readFile(new URL('vocab/js/dictionary-app-v108.js',root),'utf8')).replace(/\r\n/gu,'\n');
 const current=(await fs.readFile(new URL('vocab/js/dictionary-app-v109.js',root),'utf8')).replace(/\r\n/gu,'\n');
 const addition='  // The HTML gates native implicit submission until the actual listeners exist.\n  // Adopt text typed during module download without clearing it or waiting on data.\n  controller.change(input.value);\n\n';
 assert.equal(current.split(addition).length,2);assert.equal(current.replace(addition,''),before);
 assert(current.indexOf(addition)>current.indexOf('form.addEventListener("submit"'));
 const entry=await fs.readFile(new URL('vocab/js/dictionary-entry-v109.js',root),'utf8');
 assert.equal(entry.split('import "./dictionary-app-v109.js"').length,2);
 const oldEntry=(await fs.readFile(new URL('vocab/js/dictionary-entry-v108.js',root),'utf8')).replace(/\r\n/gu,'\n');
 assert.equal(entry.replace(/\r\n/gu,'\n').replace('./dictionary-app-v109.js','./dictionary-app-v108.js'),oldEntry);
 assert(!entry.includes('dictionary-app-v108.js'));assert(entry.includes('from "./pwa.js?v=77"'));
 assert(entry.includes('from "./dictionary-offline-warm-v108.js"'));
 const sw=await fs.readFile(new URL('vocab/sw.js',root),'utf8');
 for(const file of['dictionary-app-v108.js','dictionary-entry-v108.js','dictionary-app-v109.js','dictionary-entry-v109.js'])assert(sw.includes('"./js/'+file+'"'));
});
test('v108 does not retarget navigation107 and retains pwa77',async()=>{
 for(const item of navigation)assert(item.allowedSha.includes(sha(await fs.readFile(new URL(item.file,root)))));
 const entry=await fs.readFile(new URL('vocab/js/dictionary-entry-v108.js',root),'utf8');
 assert(entry.includes('from "./pwa.js?v=77"'));assert(entry.includes('import "./dictionary-app-v108.js"'));assert(entry.includes('from "./dictionary-offline-warm-v108.js"'));
});
test('v108 optional loaders use only the unqueried current wrapper',async()=>{
 for(const name of['dictionary-app-v108.js','dictionary-examples-ui-v108.js']){
  const body=await fs.readFile(new URL('vocab/js/'+name,root),'utf8');
  assert.equal(body.split('import("./dictionary-examples-current-v4.js")').length,2);
  assert(!body.includes('import("./dictionary-examples.js'));
 }
});
