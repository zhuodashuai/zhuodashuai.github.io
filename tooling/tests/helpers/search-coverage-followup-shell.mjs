import { restoreChineseQueryCacheShell } from './chinese-query-cache-shell.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Authenticate complete current HTML before undoing only these4 entryURL bumps.
// Existing prior shell and historical pins remain unchanged in the next layer.
const entries = new Map([
  [
    "index.html",
    {
      "pins": [
        [
          14536,
          "27d00004cef67581c3e5547a2f5d8b151d82de7c05bc1b8162ea1e637066e118"
        ],
        [
          14660,
          "4316e368693374660e8f32135d62f3311ffe9b250003eca3110364f2a36126b2"
        ]
      ],
      "current": "src=\"js/public-app-v113.js?v=118\"",
      "previous": "src=\"js/public-app-v113.js?v=117\""
    }
  ],
  [
    "personal.html",
    {
      "pins": [
        [
          23743,
          "fcbc31bd575d3ba44745719a9f63778d0d51b97b137bdc240c923c50669ac6d6"
        ],
        [
          23843,
          "14e2a79adb17ad46554de5ef624b1de8d17126b5d23d2cc96b8d1d303e21f3b6"
        ]
      ],
      "current": "src=\"js/personal-app-v108.js?v=115\"",
      "previous": "src=\"js/personal-app-v108.js?v=114\""
    }
  ],
  [
    "owner.html",
    {
      "pins": [
        [
          12864,
          "ba9c1f453e5ec3b0409d9ac6c32705f173202956bbde852f60232acfb55caf63"
        ],
        [
          12913,
          "6003dcf3aafcc0d6f59c6f5ef1f2e50f985ad462fb0182070809c9755557851c"
        ]
      ],
      "current": "src=\"js/owner-app-v108.js?v=115\"",
      "previous": "src=\"js/owner-app-v108.js?v=114\""
    }
  ],
  [
    "dictionary.html",
    {
      "pins": [
        [
          7911,
          "d2a201666e6a7c70a29e4164990c2e5b686752beb88ecb57ae895b15170321e2"
        ],
        [
          8011,
          "cae82ff614f21762a0427441b8c08657543a69ebe290bc9f0684f461116737b7"
        ]
      ],
      "current": "src=\"js/dictionary-entry-v109.js?v=115\"",
      "previous": "src=\"js/dictionary-entry-v109.js?v=114\""
    }
  ]
]);
export function restoreSearchCoverageFollowupShell(file,text){
  text=restoreChineseQueryCacheShell(file,text);
  const entry=entries.get(file);if(!entry)return text;
  const bytes=Buffer.from(text),digest=createHash('sha256').update(bytes).digest('hex');
  assert(entry.pins.some(([size,sha])=>size===bytes.length&&sha===digest),file+': current search-coverage shell snapshot changed');
  assert.equal(text.split(entry.current).length,2,'Exactly one reviewed entryURL: '+entry.current);
  return text.replace(entry.current,entry.previous);
}
