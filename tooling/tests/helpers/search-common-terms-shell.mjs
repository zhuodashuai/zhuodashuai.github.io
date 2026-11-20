import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Authenticate the complete117/common-terms shell before reversing only4 entry URLs.
// The unchanged116 cache-phase bridge then authenticates every older complete snapshot.
const entries=new Map([
  [
    "index.html",
    {
      "pins": [
        [
          14536,
          "7be4003ff16d2c752ba91cfb62b68b181b70f38a9e41f21f803c121b15d2da63"
        ],
        [
          14660,
          "87efd6f92abcc82a9a98f953ccd2df26daa3fa435deb4a5b460810e5a42711bb"
        ]
      ],
      "current": "src=\"js/public-app-v113.js?v=120\"",
      "previous": "src=\"js/public-app-v113.js?v=119\""
    }
  ],
  [
    "dictionary.html",
    {
      "pins": [
        [
          7911,
          "c888a01da22aa77ba843316757a24cc46aeb059223d1b714d1cd4926619a3c8d"
        ],
        [
          8011,
          "5b5ffb6b9ff5f3f9b333529557e34fab1e9ccca6cbe9244c655d43f651c918e1"
        ]
      ],
      "current": "src=\"js/dictionary-entry-v109.js?v=117\"",
      "previous": "src=\"js/dictionary-entry-v109.js?v=116\""
    }
  ],
  [
    "owner.html",
    {
      "pins": [
        [
          12864,
          "05815fa4b0ab91685adb7a5175fcd1cb46dda0668c4cc5e44008868f070019cb"
        ],
        [
          12913,
          "809a8bb55ca78c633b4d2d481e7677d014e0f5591be348e7648bcc3d91089c6f"
        ]
      ],
      "current": "src=\"js/owner-app-v108.js?v=117\"",
      "previous": "src=\"js/owner-app-v108.js?v=116\""
    }
  ],
  [
    "personal.html",
    {
      "pins": [
        [
          23743,
          "29d880b74754c300d5e4bcb2a98f05c89c2d1b4c121f23babb34ffe34d4a7010"
        ],
        [
          23843,
          "b27283b6147448c4b1041c3e81950b29e0383cbf7b6debaf42948c77dd9e0297"
        ]
      ],
      "current": "src=\"js/personal-app-v108.js?v=117\"",
      "previous": "src=\"js/personal-app-v108.js?v=116\""
    }
  ]
]);
export function restoreSearchCommonTermsShell(file,text){
  const entry=entries.get(file);if(!entry)return text;
  const bytes=Buffer.from(text),digest=createHash('sha256').update(bytes).digest('hex');
  assert(entry.pins.some(([size,sha])=>size===bytes.length&&sha===digest),file+': current common-terms shell snapshot changed');
  assert.equal(text.split(entry.current).length,2,'Exactly one reviewed117 entryURL: '+entry.current);
  return text.replace(entry.current,entry.previous);
}
