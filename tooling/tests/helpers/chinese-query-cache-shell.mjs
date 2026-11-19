import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Authenticate the whole116 cache-phase shell before reversing only its reviewed entry URL.
// Earlier shell helpers retain their original exact pins and finite transformations.
const entries=new Map([
  [
    "index.html",
    {
      "pins": [
        [
          14536,
          "ab3ec0c1e829b10e256f7ff08bb77bf93e0a47c233e16303bda42b97ebac91ad"
        ],
        [
          14660,
          "6ba74a58041e7290b33ddcd4df3b64c177a6b743f02058de8173dd65756914ff"
        ]
      ],
      "current": "src=\"js/public-app-v113.js?v=119\"",
      "previous": "src=\"js/public-app-v113.js?v=118\""
    }
  ],
  [
    "dictionary.html",
    {
      "pins": [
        [
          7911,
          "3daf71683f9c2af899442508df642d5724747828eddac4c7454234708174a48e"
        ],
        [
          8011,
          "0cc7f76173692612818229a72ca7c4e2932dd41f709aeb36ab9a894ab7cc8757"
        ]
      ],
      "current": "src=\"js/dictionary-entry-v109.js?v=116\"",
      "previous": "src=\"js/dictionary-entry-v109.js?v=115\""
    }
  ],
  [
    "owner.html",
    {
      "pins": [
        [
          12864,
          "60283e567f5d0fc727d89c1233ff6eff85e78a9eebc4e7c5df92a967c86e34c2"
        ],
        [
          12913,
          "f6f441d207fdc11189249fddb88fbe2f2e9c590390301887d273527254505ef6"
        ]
      ],
      "current": "src=\"js/owner-app-v108.js?v=116\"",
      "previous": "src=\"js/owner-app-v108.js?v=115\""
    }
  ],
  [
    "personal.html",
    {
      "pins": [
        [
          23743,
          "0c9e543700ac905d4e4c073c737d967341f06cc2670ac9c30034c23e2dc3520a"
        ],
        [
          23843,
          "d7a83b82761f1a875ddb3ea9f7691bec1119aebd3f0664542ecfe1110091459a"
        ]
      ],
      "current": "src=\"js/personal-app-v108.js?v=116\"",
      "previous": "src=\"js/personal-app-v108.js?v=115\""
    }
  ]
]);
export function restoreChineseQueryCacheShell(file,text){
  const entry=entries.get(file);if(!entry)return text;
  const bytes=Buffer.from(text),digest=createHash('sha256').update(bytes).digest('hex');
  assert(entry.pins.some(([size,sha])=>size===bytes.length&&sha===digest),file+': current Chinese-query-cache shell snapshot changed');
  assert.equal(text.split(entry.current).length,2,'Exactly one reviewed cache-phase entryURL: '+entry.current);
  return text.replace(entry.current,entry.previous);
}
