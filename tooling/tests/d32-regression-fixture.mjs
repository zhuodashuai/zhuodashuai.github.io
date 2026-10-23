// Actual local D32 registration, not publication. No builders/CLI/writes on import or load.
// Reuses frozen language opinions embedded in the two exact queues; does not rescan1164 histories.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),HASH=/^[a-f0-9]{64}$/u;
const sha=b=>createHash('sha256').update(b).digest('hex'),sem=v=>sha(JSON.stringify(v));
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export const D32_BUILD=freeze({
  "queues": [
    {
      "file": "tooling/dictionary/examples/queues/batch-0032.json",
      "bytes": 2122595,
      "sha256": "894b153fd994176ce872763f218e2367fb2bcae5c7a40f610182b60d6c9bc678",
      "retainedSemanticSha256": "ef0d7e228f8862616f5d6b7139f75b7599aef115cb16ae7e72182320f105fd6a"
    },
    {
      "file": "tooling/dictionary/examples/queues/batch-0032-supplement.json",
      "bytes": 458128,
      "sha256": "34ff3c0f5e0322aa2984072af22404832319afabfa92997ec547249edaae1443",
      "retainedSemanticSha256": "3a6ad98e2dd0c35e6ee7a360054a5ef077f8b1d67c54f6b8195028b00d3033d6"
    }
  ],
  "additiveIndex": {
    "file": "tooling/dictionary/examples/additive-index-v4.json"
  },
  "audit": {
    "file": "vocab/data/dictionary-examples/audit-v4/7bd4a42b01de66f193435a5facb22ee5d350a8d14e719244d8146f4abaa19cc6.json",
    "bytes": 1017,
    "sha256": "b2796d6b9a0fe4df39d71b98d265b8081c54a90e118585b5b1744ec61fc40185"
  },
  "catalogue": {
    "file": "catalogue-v4/d696a224f5e7c49a78b8e37317dbfed1a65667fcb3f6f085fed5bc0cf973171f.bin",
    "codec": "gzip",
    "bytes": 1660,
    "sha256": "d696a224f5e7c49a78b8e37317dbfed1a65667fcb3f6f085fed5bc0cf973171f",
    "decodedBytes": 4056,
    "decodedSha256": "ace34696bc4c219181753da0b107bea2be86d93402c3efda107f6ff00f10664a"
  },
  "standardPacks": [
    {
      "name": "p001",
      "file": "batch-0032-p001.json",
      "source": {
        "file": "tooling/dictionary/examples/source/batch-0032-p001.json",
        "bytes": 5609,
        "sha256": "9e546906608d0da0e76b9c56f2c6931cc9531f9657fc377876d9d4eb5cd8309c"
      },
      "review": {
        "file": "tooling/dictionary/examples/reviews/batch-0032-p001.json",
        "bytes": 64112,
        "sha256": "eb1fb2e57b4786b297fb5d6dbae6363e840e0747af78b1a01be16b914e084351"
      }
    },
    {
      "name": "p002",
      "file": "batch-0032-p002.json",
      "source": {
        "file": "tooling/dictionary/examples/source/batch-0032-p002.json",
        "bytes": 16162,
        "sha256": "7892ec5a5aa566a2c459242f3b561f266fdcc375016ab1397bca793590e9c8f6"
      },
      "review": {
        "file": "tooling/dictionary/examples/reviews/batch-0032-p002.json",
        "bytes": 148465,
        "sha256": "4e561c7fb3468ea1fe2eca0c7e90619875d27f1f58f56287d12c7821cd5dd166"
      }
    },
    {
      "name": "p002-child",
      "file": "batch-0032-p002-child.json",
      "source": {
        "file": "tooling/dictionary/examples/source/batch-0032-p002-child.json",
        "bytes": 678,
        "sha256": "db0abe0d7fdac456b3825c5ffad9352992d8429900236227b7507d185aa2a0d8"
      },
      "review": {
        "file": "tooling/dictionary/examples/reviews/batch-0032-p002-child.json",
        "bytes": 4355,
        "sha256": "7ef6aed3adbf58641961ac7abb18c7d9eb96126ba9b1e8284b6d02b385b95b8f"
      }
    },
    {
      "name": "ive-child",
      "file": "batch-0032-ive-child.json",
      "source": {
        "file": "tooling/dictionary/examples/source/batch-0032-ive-child.json",
        "bytes": 479,
        "sha256": "9f6ef17e133829da54379c09c99f083fb02a88342e391a88f5ee1881463d2c6a"
      },
      "review": {
        "file": "tooling/dictionary/examples/reviews/batch-0032-ive-child.json",
        "bytes": 8623,
        "sha256": "645061d759a86fb4a259471d00a596f90b0308e768152a44a82915970f8d0602"
      }
    },
    {
      "name": "root",
      "file": "batch-0032-root.json",
      "source": {
        "file": "tooling/dictionary/examples/source/batch-0032-root.json",
        "bytes": 8352,
        "sha256": "3a0fbe9f7569888d693a738168eb2f6b5aa12e6a437549c3fe362256c39c5fdf"
      },
      "review": {
        "file": "tooling/dictionary/examples/reviews/batch-0032-root.json",
        "bytes": 55032,
        "sha256": "cc0a629b9b11361948782125ed9d4299cd10cd0f0e7048c6cf74645283c3e664"
      }
    },
    {
      "name": "source9-01",
      "file": "batch-0032-source9-01.json",
      "source": {
        "file": "tooling/dictionary/examples/source/batch-0032-source9-01.json",
        "bytes": 4786,
        "sha256": "382899fdefcef0bf67048cbbcf2bc6de6e2657177c93ee1dd4a74ff6a18132ab"
      },
      "review": {
        "file": "tooling/dictionary/examples/reviews/batch-0032-source9-01.json",
        "bytes": 19255,
        "sha256": "a882dae22cb727f7b691a276a5ea4f961720d1bb46477be9f9f5baaabff2e042"
      }
    },
    {
      "name": "yuk-child",
      "file": "batch-0032-yuk-child.json",
      "source": {
        "file": "tooling/dictionary/examples/source/batch-0032-yuk-child.json",
        "bytes": 413,
        "sha256": "c40920743416a952f167098a8f0937aa1d84d9dda98b470d8ede9b3d71960ec3"
      },
      "review": {
        "file": "tooling/dictionary/examples/reviews/batch-0032-yuk-child.json",
        "bytes": 3868,
        "sha256": "d4de43ddbb96284089ddfd703a5a4f502055e8174f8c793be3f8cb249e7cf38f"
      }
    },
    {
      "name": "source9-02",
      "file": "batch-0032-source9-02.json",
      "source": {
        "file": "tooling/dictionary/examples/source/batch-0032-source9-02.json",
        "bytes": 4755,
        "sha256": "f69e09d81c1de38ec9e88576dd725dc27f81382d81388d6c4b168c31933fd200"
      },
      "review": {
        "file": "tooling/dictionary/examples/reviews/batch-0032-source9-02.json",
        "bytes": 32920,
        "sha256": "323ff56ccb3945c89ac13c0c0debcb63fa1fd4afc2e60a6c9a682ebd772cc64f"
      }
    },
    {
      "name": "source9-03",
      "file": "batch-0032-source9-03.json",
      "source": {
        "file": "tooling/dictionary/examples/source/batch-0032-source9-03.json",
        "bytes": 4982,
        "sha256": "fccee77f83e7b67c010283d7d25057c005d861684075a2d353c49ac1db6eb9a6"
      },
      "review": {
        "file": "tooling/dictionary/examples/reviews/batch-0032-source9-03.json",
        "bytes": 37250,
        "sha256": "d24a35c336e93147dab1960c4c041d61b0f0f5723a8031b5e8ce43dd88999e2b"
      }
    },
    {
      "name": "role-01",
      "file": "batch-0032-role-01.json",
      "source": {
        "file": "tooling/dictionary/examples/source/batch-0032-role-01.json",
        "bytes": 5425,
        "sha256": "9db1611411f8fff81319693815bb936ea88ec0162e50449a01756676ea460ad5"
      },
      "review": {
        "file": "tooling/dictionary/examples/reviews/batch-0032-role-01.json",
        "bytes": 35635,
        "sha256": "929b39cda88213ae8a93b364455638b787a800ca4b8f2dc6bed83eb89162879b"
      }
    },
    {
      "name": "role-02",
      "file": "batch-0032-role-02.json",
      "source": {
        "file": "tooling/dictionary/examples/source/batch-0032-role-02.json",
        "bytes": 5891,
        "sha256": "b1f91a0786a3eb5abce7e358eb89c3f581577391cfdc595a7d1337a9099c753b"
      },
      "review": {
        "file": "tooling/dictionary/examples/reviews/batch-0032-role-02.json",
        "bytes": 40933,
        "sha256": "54e68f6f818c6d05b3a91642ed6671be967c1d5d756caa0860ae98cc3c2c3bf9"
      }
    },
    {
      "name": "role-03",
      "file": "batch-0032-role-03.json",
      "source": {
        "file": "tooling/dictionary/examples/source/batch-0032-role-03.json",
        "bytes": 6647,
        "sha256": "df2c0e179fbed4dbfc6dc2a07a925900acc99e83d02d96648b3002457934a290"
      },
      "review": {
        "file": "tooling/dictionary/examples/reviews/batch-0032-role-03.json",
        "bytes": 45402,
        "sha256": "b4d28ed75be60db16800936bae3fa8ad4a91351f537e57cb31c1061ff241b706"
      }
    },
    {
      "name": "role-04",
      "file": "batch-0032-role-04.json",
      "source": {
        "file": "tooling/dictionary/examples/source/batch-0032-role-04.json",
        "bytes": 6193,
        "sha256": "f859005c472a77fb0280d73f21c359f01329d1914e94b38ec3191eac909c1714"
      },
      "review": {
        "file": "tooling/dictionary/examples/reviews/batch-0032-role-04.json",
        "bytes": 41428,
        "sha256": "bb90535c4bc377bf1e970d3072cc2165ada62d32c57e056cbf50ddbada2644a6"
      }
    },
    {
      "name": "role-05",
      "file": "batch-0032-role-05.json",
      "source": {
        "file": "tooling/dictionary/examples/source/batch-0032-role-05.json",
        "bytes": 5148,
        "sha256": "b67b471d0f2c814fa203b6661aeb6b3f476a10bde25acfb225d41410dd344b16"
      },
      "review": {
        "file": "tooling/dictionary/examples/reviews/batch-0032-role-05.json",
        "bytes": 36577,
        "sha256": "9936501d5c3a33f3ef9ef1ee375107829e2db4852f12da8d8f9cdc90cf581daa"
      }
    },
    {
      "name": "source9-04",
      "file": "batch-0032-source9-04.json",
      "source": {
        "file": "tooling/dictionary/examples/source/batch-0032-source9-04.json",
        "bytes": 6839,
        "sha256": "1dbde300d584a33d9eaf4d5407bc26ca14a7a1f9e64cf41c506e7a773e517114"
      },
      "review": {
        "file": "tooling/dictionary/examples/reviews/batch-0032-source9-04.json",
        "bytes": 63073,
        "sha256": "39e737ea80cfe9ec8b5cf1891af9020ceb95621484a57c8651c85e493dbb1e12"
      }
    }
  ],
  "oldIndex": {
    "file": "tooling/dictionary/examples/index.json",
    "bytes": 15292,
    "sha256": "5ad539e7c6ff64c3f617ed77eac3082dd21468b338ef3d60a77f7d771720cb53"
  }
});
export const D32_BASE=freeze({version:'afff0148b5c2cf401feb1ef646bb61a3fc2bcefd984050b8a0609f711f47c3c4',sha256:'23846f67b86c43bcd3b5b2e8b36fcf93ef19c63f2ac28ce982e989b3a13557e9',bytes:57577,heads:86415,examples:87804});
export const D32_SOURCE=freeze({version:'cabcf549c1b4b4ebaff5aef42eb2bc2ff893779a3b51599850b413dba1327644',manifestSha256:'2ef468b0443d76996e31fb910a904a3e05cb677d695715cfc325ad46c8a8bf3f',records:102609});
export const D32_COUNTS=freeze({heads:86700,examples:88089,addedHeads:285,addedExamples:285,considered:593,excluded:308});
const ordinary='support-exact-original-pair-for-possible-admission';
export const D32_COHORTS=freeze([
 ['p001',21,'d32_author_source9','d32_reviewer_role',ordinary],
 ['p002',60,'d32_author_source9_p002','d32_reviewer_role_p002',ordinary],
 ['p002-child',2,'d32_author_source9_p002_child01','d32_reviewer_role_p002_child01','support-exact-separately-authored-translation-child-for-possible-admission'],
 ['ive-child',1,'d32_author_root_ive_child','d32_reviewer_role_ive_child','support-exact-child-as-explicit-per-head-derived-usage-annotation-for-possible-admission'],
 ['root',27,'d32_author_root_c201_250','d32_reviewer_prepare_root50',ordinary],
 ['source9-01',17,'d32_author_source9_master01','d32_reviewer_root_source9_c001_050','support-exact-original'],
 ['yuk-child',1,'d32_author_source9_master01_yuk_child01','d32_reviewer_root_source9_c001_050','support-exact-child-only'],
 ['source9-02',16,'d32_author_source9_master02','d32_reviewer_prepare_source9_02',ordinary],
 ['source9-03',17,'d32_author_source9_master03','d32_reviewer_prepare_source9_03',ordinary],
 ['role-01',18,'d32_author_role_01','d32_reviewer_prepare_role01',ordinary],
 ['role-02',20,'d32_author_role_02','d32_reviewer_prepare_role02',ordinary],
 ['role-03',23,'d32_author_role_03','d32_reviewer_prepare_role03',ordinary],
 ['role-04',21,'d32_author_role_04','d32_reviewer_prepare_role04',ordinary],
 ['role-05',17,'d32_author_role_05','d32_reviewer_prepare_role05',ordinary],
 ['source9-04',24,'d32_author_source9_master04','d32_reviewer_role','support']
]);
const fold=s=>s.normalize('NFKC').replace(/[‘’‛ʼ]/gu,"'").replace(/[“”„‟]/gu,'"').replace(/\s+/gu,' ').trim().toLocaleLowerCase('en-US');
const five=r=>[r.term,r.partOfSpeech,r.meaningZh,r.en,r.zh],order=(a,b)=>a.term<b.term?-1:a.term>b.term?1:0;
// Exact pre-existing contextual cells, never a general xref/gloss-policy waiver.
export const D32_EXACT_CONTEXTUAL_CELLS=freeze([
  {
    "term": "I've",
    "group": "ive-child",
    "rawMeaning": "（等于I have）",
    "selectedMeaning": "I have 的缩写；本例与过去分词连用，表示已经做过某事。",
    "pairSha256": "1718ade578c9ec4bd3ee3e94834fbf2158b4810a55605aa33229447ebd187c00"
  },
  {
    "term": "ch.",
    "group": "root",
    "rawMeaning": "章",
    "selectedMeaning": "章（chapter 的书面缩写）",
    "pairSha256": "2c8687987d0a031405251cf48be4706d618dbb2bf972c6bc0555cf4b3ca41919"
  },
  {
    "term": "chap.",
    "group": "root",
    "rawMeaning": "章",
    "selectedMeaning": "章（chapter 的书面缩写）",
    "pairSha256": "cd7111f10f3cb9532af3e108d6e718c3b22ef97ea50f2d51fc57d3f71fc06eac"
  },
  {
    "term": "et al.",
    "group": "root",
    "rawMeaning": "以及其他人, 以及其他地方, ...等人",
    "selectedMeaning": "以及其他人；等人（用于列举姓名）",
    "pairSha256": "4b4a340054ec48bf968d448067ca1a52c6a75e7d92d07dd6a9c706eb62b22321"
  },
  {
    "term": "for all I know",
    "group": "root",
    "rawMeaning": "亦未可知",
    "selectedMeaning": "说不定；也许（表示自己并不确知）",
    "pairSha256": "de12c0a4aca1da311314dbf6dd9983bc4e1a1a2d0e1df216cc7e53b557432a6e"
  },
  {
    "term": "h'm",
    "group": "root",
    "rawMeaning": "interj. 哼",
    "selectedMeaning": "哼；嗯（本例表示思索、迟疑）",
    "pairSha256": "6e6820fef5ef0a05a49e68526ecdb2104cc532e2faeef906df3bfc5dc04ded24"
  },
  {
    "term": "innit",
    "group": "root",
    "rawMeaning": "int. 是不是；对不对",
    "selectedMeaning": "是不是；对不对（英式非标准口语附加问句）",
    "pairSha256": "e3bc7feddbcb2eb69d04f0c2675d84a3577e63d89fb62ee15e4172961d95cc8d"
  },
  {
    "term": "not so much...as",
    "group": "root",
    "rawMeaning": "与其...不如",
    "selectedMeaning": "与其说……不如说……",
    "pairSha256": "f8840441920b25d1886ed07563df162c67d8aa28690a3dfe44a54675cbd4907d"
  },
  {
    "term": "not to say",
    "group": "root",
    "rawMeaning": "虽不能说...",
    "selectedMeaning": "甚至可以说；即使不说是……（用更强的说法加强前面的判断）",
    "pairSha256": "ad6e9e62c4ea19093ad5948f0ed70482f7dd34ad1bb4eb3d35061f74868c21ea"
  },
  {
    "term": "ute",
    "group": "root",
    "rawMeaning": "n. 犹特人（美洲印第安人的一种）",
    "selectedMeaning": "犹特人；北美犹特原住民族群的一员",
    "pairSha256": "251268a9bf8dd0b79add53c82f62bc20b80c6125ced36eb08af91c03161418b2"
  },
  {
    "term": "a.m.",
    "group": "root",
    "rawMeaning": "上午, 午前",
    "selectedMeaning": "上午；午前（与钟点连用）",
    "pairSha256": "6861d877126c68f668a3635e6bad21aeaff413052b77aa55fdeb99c7744f286f"
  },
  {
    "term": "P.M.",
    "group": "root",
    "rawMeaning": "下午, 午后",
    "selectedMeaning": "下午；午后（与钟点连用）",
    "pairSha256": "08dcf89e1d81a865ebe65cd1b03c31185b999b9a16fc85bf1a6dc98b57ee73e9"
  },
  {
    "term": "if not A, then B",
    "group": "root",
    "rawMeaning": "① 即使不算是 A，至少也是 B；用较谨慎、较弱的第二个说法修正前一个判断。",
    "selectedMeaning": "即使不算是 A，至少也是 B；用较弱的判断修正较强的判断",
    "pairSha256": "92e634a2cbd28a4921b1e1f85a2f0db36b22c6b55b3a010f72606a1b457da701"
  },
  {
    "term": "There's nothing wrong with it.",
    "group": "root",
    "rawMeaning": "这样并没有什么不对；这样是可以接受的。",
    "selectedMeaning": "这样没有什么不对；这样可以接受",
    "pairSha256": "35bb088b771d8fbe91c9d0c406712c381a7075aacf6b6605d8233ea777a5cc8f"
  },
  {
    "term": "This above all: to thine own self be true.",
    "group": "root",
    "rawMeaning": "quote：一句著名的劝诫,强调人必须忠于自我,坚守本心。",
    "selectedMeaning": "最重要的是忠于自己；坚守本心（莎士比亚《哈姆雷特》中的话）",
    "pairSha256": "24b779361407cacd2e785ab283ba3184ebc0e7c5035fa1596d50c4ae24659912"
  },
  {
    "term": "What have we got to lose?",
    "group": "root",
    "rawMeaning": "① 试一试又能损失什么呢？用于说明尝试的风险或代价很小。",
    "selectedMeaning": "试试又能损失什么呢？（表示尝试的风险或代价很小）",
    "pairSha256": "2e0567210ae22b2031777ee06712bc44a89b68ed30db359692f18fcdf568d9c4"
  },
  {
    "term": "Et",
    "group": "root",
    "rawMeaning": "[化] 乙基",
    "selectedMeaning": "乙基的化学缩写符号",
    "pairSha256": "97e6a7fe2d2385e274d7e37e3586d66f77a94ed61170d7deaf1f3a1ee3810648"
  },
  {
    "term": "Fe",
    "group": "root",
    "rawMeaning": "[计] 现场工程师\n[医] 铁(26号元素)",
    "selectedMeaning": "铁；化学元素符号 Fe",
    "pairSha256": "d454dcb3330613ca584dde1639c920ca4e3ae4d738eebcff25a215254b8b7ab0"
  },
  {
    "term": "ISA",
    "group": "root",
    "rawMeaning": "[计] 指令系统体系结构, 工业标准结构",
    "selectedMeaning": "指令集体系结构",
    "pairSha256": "3db1afda918506798c71a54571f5eb1c16842926dc25dabdd8779ebea3ccf307"
  },
  {
    "term": "GC",
    "group": "root",
    "rawMeaning": "[化] 气相色谱法; 气相层析",
    "selectedMeaning": "气相色谱法；气相层析法",
    "pairSha256": "741e9a6156dc2fc17505ff705c2eddc58203075d863d42408952d752a525f014"
  },
  {
    "term": "sal",
    "group": "root",
    "rawMeaning": "n. 婆罗双树, 盐\n[医] 盐",
    "selectedMeaning": "婆罗双树；娑罗树（Shorea robusta）",
    "pairSha256": "cc73b005a26b24deb1e906ec057b9f22d36f66c171afc8e317ba9c109c04b864"
  },
  {
    "term": "bu",
    "group": "root",
    "rawMeaning": "[经] 英斗",
    "selectedMeaning": "英斗；英制蒲式耳（容量单位的缩写）",
    "pairSha256": "3c7151ac2415111cdc2d1288f5d0f5de8e707ba629f232d2b417718dc98a7d11"
  },
  {
    "term": "DCE",
    "group": "root",
    "rawMeaning": "[计] 数据电路终端设备, 数据通信设备",
    "selectedMeaning": "数据电路终端设备；数据通信设备",
    "pairSha256": "60129347dc1427aae5a29c2240950c362ab0156665b9e669a5c1307cb9acbcb7"
  },
  {
    "term": "mth",
    "group": "root",
    "rawMeaning": "[经] 月",
    "selectedMeaning": "月（month 的书面缩写）",
    "pairSha256": "7cf9004cf022c85046a7bf489cf1d975f5e50549184fa74ebe9fbb642059e986"
  }
]);
function pin(p){assert(p&&typeof p.file==='string'&&!path.isAbsolute(p.file)&&!p.file.split('/').includes('..'));assert(Number.isSafeInteger(p.bytes)&&p.bytes>0);assert.match(p.sha256,HASH);}
export function requireActualD32Build(registration=D32_BUILD){
 assert(registration,'D32_BUILD is null: actual285 standard packs, normal --write/--check and raw artifact registration are required');
 const b=structuredClone(registration);assert.deepEqual(Object.keys(b).sort(),['queues','additiveIndex','audit','catalogue','standardPacks','oldIndex'].sort());
 assert.equal(b.queues.length,2);for(const p of b.queues){pin(p);assert.match(p.retainedSemanticSha256,HASH);}
 assert.deepEqual(b.queues.map(p=>p.file),['tooling/dictionary/examples/queues/batch-0032.json','tooling/dictionary/examples/queues/batch-0032-supplement.json']);
 for(const p of[b.audit,b.oldIndex])pin(p);
 assert.deepEqual(Object.keys(b.additiveIndex),['file']);
 assert.equal(b.additiveIndex.file,'tooling/dictionary/examples/additive-index-v4.json');assert.equal(b.oldIndex.file,'tooling/dictionary/examples/index.json');
 assert.equal(b.oldIndex.sha256,'5ad539e7c6ff64c3f617ed77eac3082dd21468b338ef3d60a77f7d771720cb53');
 assert.match(b.audit.file,/^vocab\/data\/dictionary-examples\/audit-v4\/[a-f0-9]{64}\.json$/u);
 assert.equal(b.standardPacks.length,15);assert.deepEqual(b.standardPacks.map(p=>p.name),D32_COHORTS.map(p=>p[0]));
 for(const p of b.standardPacks){assert.equal(p.file,'batch-0032-'+p.name+'.json');pin(p.source);pin(p.review);assert.equal(p.source.file,'tooling/dictionary/examples/source/'+p.file);assert.equal(p.review.file,'tooling/dictionary/examples/reviews/'+p.file);}
 assert.equal(b.catalogue.codec,'gzip');assert.match(b.catalogue.sha256,HASH);assert.match(b.catalogue.decodedSha256,HASH);assert.equal(b.catalogue.file,'catalogue-v4/'+b.catalogue.sha256+'.bin');
 return freeze(b);
}
function historicalD32Index(build){return{schemaVersion:1,base:{file:'manifest-v2.json',bytes:D32_BASE.bytes,sha256:D32_BASE.sha256,version:D32_BASE.version,counts:{heads:D32_BASE.heads,examples:D32_BASE.examples}},source:{version:D32_SOURCE.version,manifestSha256:D32_SOURCE.manifestSha256},previousCatalogue:null,releases:[{id:'examples-0032',sourceFiles:build.standardPacks.map(p=>p.file)}]};}
// The mutable build index may append later reviewed releases. It must keep the
// D32 release prefix exact; immutable D32 catalogue/delta bytes remain pinned.
// Later whole-build/activation validation belongs to the active release tests.
export async function assertD32CurrentIndex(value){
 const {validateAdditiveIndex}=await import('../scripts/build-dictionary-examples-additive.mjs');
 const index=validateAdditiveIndex(value),historical=historicalD32Index(requireActualD32Build());
 assert.deepEqual(index.base,historical.base);assert.deepEqual(index.source,historical.source);
 assert.deepEqual(index.releases[0],historical.releases[0]);
 return index;
}
export function assertD32ReviewedRow(row,proof,cohort,record,review){
 assert.equal(proof.term,row.term);assert.equal(record.term,row.term);assert.equal(proof.canonicalId,record.id);assert.equal(proof.canonicalSourceSha256,sem(record));
 assert.equal(proof.authorPrincipal,cohort[2]);assert.equal(proof.reviewerPrincipal,cohort[3]);assert.notEqual(proof.authorPrincipal,proof.reviewerPrincipal);
 assert.equal(review.reviewer,'AI/'+cohort[3]);assert.equal(proof.pairSha256,sem(five(row)));assert.equal(proof.wholeIndependentDecision.decision,cohort[4]);
 assert(row.partOfSpeech.split(' · ').every(tag=>record.partOfSpeech.split(' · ').includes(tag)),'Selected POS outside actual source: '+row.term);if(!record.meaning.includes(row.meaningZh)){const exact=D32_EXACT_CONTEXTUAL_CELLS.find(e=>e.term===row.term);assert(exact,'Unregistered contextual cell: '+row.term);assert.equal(exact.group,cohort[0]);assert.equal(exact.rawMeaning,record.meaning);assert.equal(exact.selectedMeaning,row.meaningZh);assert.equal(exact.pairSha256,proof.pairSha256);assert.equal(proof.wholeIndependentDecision.pairSha256,exact.pairSha256);}
 assert.equal(typeof proof.wholeIndependentDecision,'object');
}
export function assertD32RetainedConservation(queues,rows){
 assert.equal(queues.length,2);const selected=new Map(rows.map(r=>[r.term,r])),considered=new Set(selected.keys()),holds=new Set(),failed=[];
 for(let i=0;i<2;i++){const q=queues[i];assert.equal(sem(q.retained),D32_BUILD.queues[i].retainedSemanticSha256);assert.equal(q.admitted,false);assert.equal(q.published,false);assert.equal(q.coverageAdded,0);assert.equal(q.productWrites,false);assert.equal(q.normalAdditiveCLIExecuted,false);assert.equal(q.originalPacksAndOpinionsUnchanged,true);
  for(const r of q.retained){assert.equal(r.selectedPairCount,q.groups.find(g=>g.name===r.name).source.entries.length);assert.equal(r.authorOriginalPairCount,r.selectedPairCount+r.unselectedOriginalDecisions.length);
   for(const h of r.originalAuthorHolds){assert.equal(typeof h.term,'string');considered.add(h.term);holds.add(h.term);}
   for(const d of r.unselectedOriginalDecisions){assert.equal(typeof d.term,'string');const p=d.wholeOriginalFiveCells||d.pair;assert(Array.isArray(p)&&p.length===5);assert.equal(sem(p),d.pairSha256);considered.add(d.term);holds.add(d.term);assert.notEqual(selected.has(d.term)?sem(five(selected.get(d.term))):null,d.pairSha256,'An unapproved original pair was selected');failed.push(d);}
  }
 }
 const excluded=[...considered].filter(t=>!selected.has(t));assert.equal(considered.size,593);assert.equal(excluded.length,308);assert.equal(failed.length,10);assert.equal(queues.flatMap(q=>q.retained).reduce((n,r)=>n+r.originalAuthorHolds.length,0),302);
 assert.deepEqual(failed.filter(d=>selected.has(d.term)).map(d=>d.term).sort(),['aloha','mhm','yuk']);
 for(const t of['ta-ta','HO','CAL','BOT','hella','CI','ALU'])assert(excluded.includes(t),'Explicit held source unexpectedly selected: '+t);
 const note=queues[0].rootExplicitAnnotationDecision;assert.equal(note.term,"I've");assert.equal(note.authorizedOnlyForExactFiveCellsAndOpinion,true);assert.equal(note.sourceChanged,false);assert.equal(note.otherXrefsApproved,false);assert.equal(note.originalP002AuthorHoldRetained,true);
 return{considered:considered.size,excluded,heldTerms:holds.size,originalFailedPairs:failed,originalAuthorHolds:302};
}
let cached;
export function loadD32Fixture(){const b=requireActualD32Build();return cached||(cached=loadActual(b));}
async function loadActual(build){
 // All registration guards execute before the first file read or product import.
 const assets=new Map(),cache=new Map();async function read(rel,p){assert(!path.isAbsolute(rel)&&!rel.split('/').includes('..'));if(!cache.has(rel))cache.set(rel,await fs.readFile(path.join(ROOT,rel)));const raw=cache.get(rel);if(p){assert.equal(raw.length,p.bytes,rel);assert.equal(sha(raw),p.sha256,rel);}if(rel.startsWith('vocab/data/'))assets.set(rel.slice('vocab/data/'.length),raw);return raw;}
 const json=async(rel,p)=>JSON.parse(await read(rel,p));
 const queues=await Promise.all(build.queues.map(p=>json(p.file,p)));assert.equal(queues[0].selectedHeads,244);assert.equal(queues[1].selectedHeads,41);assert.equal(queues[1].previousD32Heads,244);assert.equal(queues[1].combinedD32Heads,285);assert.equal(queues[1].previousCandidate.sha256,build.queues[0].sha256);assert.equal(queues[1].previousCandidate.bytes,build.queues[0].bytes);
 for(const q of queues){assert.deepEqual(q.base,{version:D32_BASE.version,heads:86415,examples:87804});assert.equal(q.sourceManifestSha256,D32_SOURCE.manifestSha256);}
 const groups=queues.flatMap(q=>q.groups);assert.deepEqual(groups.map(g=>g.name),D32_COHORTS.map(g=>g[0]));
 const currentIndexRaw=await read(build.additiveIndex.file),currentIndex=await assertD32CurrentIndex(JSON.parse(currentIndexRaw)),index=historicalD32Index(build);
 const oldIndex=await json(build.oldIndex.file,build.oldIndex);assert.equal(oldIndex.sourceFiles.length,555);for(const f of index.releases[0].sourceFiles)assert(!oldIndex.sourceFiles.includes(f));
 const source=await json('vocab/data/expanded-dictionary/manifest.json',{bytes:55060,sha256:D32_SOURCE.manifestSha256});assert.equal(source.version,D32_SOURCE.version);assert.equal(source.counts.records,102609);
 const records=new Map(),byId=new Map();let sourceBodies=0;for(const d of source.english.shards){assert.equal(d.file,D32_SOURCE.version+'/en-'+String(d.bucket).padStart(3,'0')+'.json');const p=await json('vocab/data/expanded-dictionary/'+d.file,d);sourceBodies++;for(const r of p.records){if(byId.has(r.id))assert.deepEqual(byId.get(r.id),r);else byId.set(r.id,r);if(r.id%128===d.bucket){assert(!records.has(r.term));records.set(r.term,r);}}}assert.equal(sourceBodies,128);assert.equal(records.size,102609);
 const {validateExampleReview}=await import('../scripts/build-dictionary-examples.mjs');
 const rows=[],proofs=new Map(),cohorts=[];for(let i=0;i<groups.length;i++){const g=groups[i],c=D32_COHORTS[i],p=build.standardPacks[i];assert.equal(g.file,p.file);const pack=await json(p.source.file,p.source),review=await json(p.review.file,p.review);assert.deepEqual(pack,g.source);assert.deepEqual(review,g.review);assert.equal(pack.entries.length,c[1]);assert.equal(review.independentOfAuthor,true);assert.equal(review.sourceSha256,sem(pack));assert.deepEqual(review.approvedTerms,pack.entries.map(r=>r.term));assert.deepEqual(review.issues,[]);assert.equal(review.evidence.rows.length,c[1]);const approved=validateExampleReview(pack,review);assert.equal(approved.length,c[1]);
  for(const row of approved){const evidence=review.evidence.rows.filter(p=>p.term===row.term);assert.equal(evidence.length,1);assert(!proofs.has(row.term));assertD32ReviewedRow(row,evidence[0],c,records.get(row.term),review);proofs.set(row.term,{proof:evidence[0],cohort:c,review});rows.push(row);}cohorts.push({name:c[0],count:c[1],sourcePin:p.source,reviewPin:p.review});}
 assert.equal(rows.length,285);const conservation=assertD32RetainedConservation(queues,rows);
 const {parseDictionaryExamplesManifest,parseDictionaryExamplesShard}=await import('../../vocab/js/dictionary-examples.js');
 const baseRaw=await read('vocab/data/dictionary-examples/manifest-v2.json',D32_BASE),base=parseDictionaryExamplesManifest(JSON.parse(baseRaw));assert.equal(base.version,D32_BASE.version);assert.deepEqual(base.counts,{heads:86415,examples:87804});assert.deepEqual(index.base,{file:'manifest-v2.json',bytes:D32_BASE.bytes,sha256:D32_BASE.sha256,version:D32_BASE.version,counts:base.counts});assert.deepEqual(index.source,{version:D32_SOURCE.version,manifestSha256:D32_SOURCE.manifestSha256});
 const before=new Map(),oldEnglish=new Set();let oldPairs=0;for(const d of base.shards){const raw=await read('vocab/data/dictionary-examples/'+d.file,d),part=parseDictionaryExamplesShard(JSON.parse(raw),base,d);for(const[t,e]of part){assert(!before.has(t));before.set(t,e);for(const s of e.senses)for(const p of s.examples){oldPairs++;oldEnglish.add(fold(p.en));}}}assert.equal(before.size,86415);assert.equal(oldPairs,87804);assert.equal(sem({schemaVersion:2,bucketCount:256,entries:[...before.values()].sort(order)}),D32_BASE.version);
 const audit=await json(build.audit.file,build.audit);assert.equal(audit.schemaVersion,4);assert.equal(audit.baseVersion,D32_BASE.version);assert.deepEqual(audit.counts,{heads:86700,examples:88089});assert.equal(audit.addedHeads,285);assert.equal(audit.addedExamples,285);assert.equal(audit.retainedWholeBaseEntries,86415);assert.equal(audit.licensedMeaningsChanged,false);assert.equal(audit.commercialExamplesUsed,false);assert.equal(audit.bookQuotesReusedAsOriginal,false);assert.deepEqual(audit.catalogue,build.catalogue);
 const {parseAdditiveCatalogue,parseAdditiveDelta,decodeGzipArtifact}=await import('../../vocab/js/dictionary-examples-additive-codec.js');const catalogue=await parseAdditiveCatalogue(await decodeGzipArtifact(await read('vocab/data/dictionary-examples/'+build.catalogue.file,build.catalogue),build.catalogue));assert.equal(catalogue.version,audit.version);assert.equal(build.audit.file,'vocab/data/dictionary-examples/audit-v4/'+catalogue.version+'.json');assert.deepEqual(catalogue.base,index.base);assert.deepEqual(catalogue.source,index.source);assert.deepEqual(catalogue.counts,audit.counts);assert.equal(catalogue.deltas.length,1);assert.equal(catalogue.keys.length,285);
 const delta=new Map();for(let i=0;i<catalogue.deltas.length;i++){const d=catalogue.deltas[i],decoded=await decodeGzipArtifact(await read('vocab/data/dictionary-examples/'+d.file,d),d,{delta:true}),strict=parseAdditiveDelta(decoded,catalogue,i);assert.equal(strict.heads,285);assert.equal(strict.examples,285);for(const r of decoded.entries){assert(!delta.has(r.term));assert.deepEqual(strict.get(r.term),r);delta.set(r.term,r);}}assert.equal(delta.size,285);
 const after=new Map(before),newEnglish=new Set();for(const row of rows){const d=delta.get(row.term),p=proofs.get(row.term).proof,sourceRecord=records.get(row.term);assert(d);assert(!before.has(row.term));assert.equal(d.canonicalId,sourceRecord.id);assert.equal(d.canonicalId,p.canonicalId);assert.equal(d.canonicalSourceSha256,sem(sourceRecord));assert.equal(d.canonicalSourceSha256,p.canonicalSourceSha256);const key=/^[a-zA-Z0-9:_-]+$/u.test(row.term)&&row.term.length<=100?row.term:sha(row.term).slice(0,24),expected={term:row.term,senses:[{id:'example:'+key,partOfSpeech:row.partOfSpeech,meaningZh:row.meaningZh,examples:[{en:row.en,zh:row.zh}],reviewer:row.reviewer,source:'原创例句·AI复核（精选义项）'}]};assert.deepEqual(d.example,expected);assert(!oldEnglish.has(fold(row.en)));assert(!newEnglish.has(fold(row.en)));newEnglish.add(fold(row.en));after.set(row.term,d.example);}
 assert.equal(after.size,86700);for(const[t,e]of before)assert.deepEqual(after.get(t),e);for(const t of conservation.excluded){assert(!delta.has(t));assert(!after.has(t));}const normalVersion=sem({schemaVersion:2,bucketCount:256,entries:[...after.values()].sort(order)});assert.equal(normalVersion,audit.fullReferenceBuildVersion);assert.equal(normalVersion,'c29b7a310169aed7ede8ad1a60f00c0388406590c9bd5205dbd5faa10cc19c80');assert.equal(queues[1].ordinaryInMemoryReference.version,normalVersion);assert.deepEqual(queues[1].ordinaryInMemoryReference.counts,audit.counts);
 const dataRoot=new URL('../../vocab/data/',import.meta.url).href,fetches=[];const fetchImpl=async(url,options={})=>{assert.equal(options.credentials,'omit');const u=new URL(url);assert.equal(u.search,'');assert.equal(u.hash,'');assert(u.href.startsWith(dataRoot),'Unexpected asset origin/path');const key=u.href.slice(dataRoot.length);assert(assets.has(key),'Unpinned asset request '+key);fetches.push(key);return new Response(assets.get(key),{status:200,headers:{'content-length':String(assets.get(key).length)}});};
 const {createAdditiveExamplesLoader}=await import('../../vocab/js/dictionary-examples-additive.js'),{searchExpandedDictionary,resetExpandedDictionaryCacheForTests}=await import('../../vocab/js/expanded-dictionary.js');const release={catalogue:build.catalogue,base:index.base,source:index.source},client=createAdditiveExamplesLoader(release,{fetchImpl});let canonicalQueries=0,actualExampleQueries=0,noQueryIsolation=0,mismatchedQueryIsolation=0,declaredFormIsolation=0,excludedQueries=0,oldRoleQueries=0;
 resetExpandedDictionaryCacheForTests();try{for(const row of rows){const result=await searchExpandedDictionary(row.term,{fetchImpl,timeoutMs:15000,limit:40});assert.equal(result.results.length,1,'Ambiguous selected canonical '+row.term);assert.equal(result.results[0].term,row.term);const provenance=source.sources[records.get(row.term).source];assert.equal(result.results[0].source,provenance.name);assert.equal(result.results[0].license,provenance.license);assert.equal(result.results[0].url,provenance.url);canonicalQueries++;assert.deepEqual(await client.load(result.results[0].term,{lookupQuery:row.term}),delta.get(row.term).example);actualExampleQueries++;assert.equal(await client.load(row.term),null);noQueryIsolation++;assert.equal(await client.load(row.term,{lookupQuery:'d32 unrelated query'}),null);mismatchedQueryIsolation++;const form=records.get(row.term).forms.find(f=>fold(f)!==fold(row.term));if(form){assert.equal(await client.load(row.term,{lookupQuery:form}),null);declaredFormIsolation++;}}
  for(const term of conservation.excluded){assert.equal(await client.load(term,{lookupQuery:term}),null);excludedQueries++;}
  for(const term of['I','dos','hol','hols','orphan','orphaned','airwave','airwaves','white','whiting','widen','widening','typecast','typecasting','three-quarters']){assert.deepEqual(await client.load(term,{lookupQuery:term}),before.get(term)||null);oldRoleQueries++;}
 }finally{client.close();resetExpandedDictionaryCacheForTests();}
 // No in-run drift is allowed, but a subsequent legitimate append does not
 // require rewriting this historical fixture or copying the whole index.
 assert.deepEqual(await fs.readFile(path.join(ROOT,build.additiveIndex.file)),currentIndexRaw);
 for(const p of[...build.queues,build.audit,build.oldIndex]){const raw=await fs.readFile(path.join(ROOT,p.file));assert.equal(raw.length,p.bytes);assert.equal(sha(raw),p.sha256);}
 return{build,queues,groups,cohorts,index,currentIndex,source,records,rows,proofs,base,before,after,delta,audit,catalogue,normalVersion,oldPairs,conservation,canonicalQueries,actualExampleQueries,noQueryIsolation,mismatchedQueryIsolation,declaredFormIsolation,excludedQueries,oldRoleQueries,fetches,sourceRawBodiesVerified:128,oldExampleRawBodiesVerified:256,oldHistoryRescans:0,productWrites:0,newLanguageDecisions:0,published:false};
}
