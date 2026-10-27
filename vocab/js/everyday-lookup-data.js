import { REVIEWED_SENSE_ENTRIES } from './reviewed-senses-data.js';
export const EVERYDAY_LOOKUP_ENTRIES = Object.freeze([
  {
    term: "live agent",
    partOfSpeech: "noun phrase",
    meaning: "① 人工客服；真人客服。指实际接待或处理问题的工作人员，区别于聊天机器人。",
    chineseAliases: ["人工客服", "真人客服", "人工客服人员", "转人工", "转接人工客服", "找人工客服"],
    englishForms: ["live agents"],
    en: "A live agent helped me correct the delivery address.",
    zh: "人工客服帮我更正了收货地址。",
    references: ["https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-hand-off"],
  },
  {
    term: "human agent",
    partOfSpeech: "noun phrase",
    meaning: "① 人工客服人员。在客服场景中，强调接待者是真人，而不是自动化程序。",
    chineseAliases: ["人工客服", "真人客服", "人工客服人员", "真人客服人员"],
    englishForms: ["human agents"],
    en: "The chatbot passed my question to a human agent.",
    zh: "聊天机器人把我的问题转交给了人工客服人员。",
    references: ["https://learn.microsoft.com/en-us/dynamics365/customer-service/use/oc-bot-dashboard"],
  },
  {
    term: "customer service representative",
    partOfSpeech: "noun phrase",
    meaning: "① 客服代表；客户服务人员。负责回答顾客问题、处理订单或提供售后帮助的人。",
    chineseAliases: ["客服代表", "客户服务代表", "客服人员", "客户服务人员", "人工客服", "真人客服"],
    englishForms: ["customer service representatives"],
    en: "The customer service representative asked for my order number.",
    zh: "客服代表询问了我的订单号。",
    references: ["https://learn.microsoft.com/en-us/power-platform/architecture/solution-ideas/customer-support-agent", "https://learn.microsoft.com/en-us/dynamics365/customer-service/use/oc-bot-dashboard"],
  },
  {
    term: "customer support",
    partOfSpeech: "noun phrase",
    meaning: "① 客户支持；客服支持。帮助用户解决产品或服务问题的工作或部门；单凭这个表达，不能确定接待者是否为真人。",
    chineseAliases: ["客户支持", "客服支持", "用户支持", "客户支持服务"],
    englishForms: [],
    en: "I contacted customer support when the app stopped opening.",
    zh: "应用无法打开后，我联系了客户支持。",
    references: ["https://learn.microsoft.com/en-us/power-platform/architecture/solution-ideas/customer-support-agent"],
  },
  {
    term: "live chat",
    partOfSpeech: "noun phrase",
    meaning: "① 在线即时聊天；在线聊天服务。指通过网页或应用即时交流的渠道，可能由真人或自动系统接待。",
    chineseAliases: ["在线即时聊天", "在线聊天", "在线聊天服务", "即时在线聊天"],
    englishForms: [],
    en: "The website offers live chat during opening hours.",
    zh: "这个网站在营业时间提供在线即时聊天服务。",
    references: ["https://www.hsbc.com.hk/help/contact/phone-numbers/"],
  },
  {
    term: "customer service hotline",
    partOfSpeech: "noun phrase",
    meaning: "① 客服热线；客户服务热线。供顾客拨打、咨询服务或反映问题的电话号码或电话服务。",
    chineseAliases: ["客服热线", "客户服务热线", "客服电话", "客户服务电话"],
    englishForms: ["customer service hotlines"],
    en: "The customer service hotline is printed on the back of the card.",
    zh: "卡片背面印着客服热线。",
    references: ["https://www.hsbc.com.cn/en-cn/help/contact/"],
  },
  {
    term: "support ticket",
    partOfSpeech: "noun phrase",
    meaning: "① 客服工单；支持工单。客服系统为一次求助建立的记录，用来跟进问题及处理进度。",
    chineseAliases: ["客服工单", "支持工单", "服务工单", "技术支持工单"],
    englishForms: ["support tickets"],
    en: "I opened a support ticket and attached a screenshot of the error.",
    zh: "我提交了一张支持工单，并附上了报错截图。",
    references: ["https://support.zendesk.com/hc/en-us/articles/8263915942938-About-the-ticket-lifecycle-and-ticket-statuses"],
  },
  {
    term: "order number",
    partOfSpeech: "noun phrase",
    meaning: "① 订单号；订单编号。商家用来识别一笔订单的号码，不一定与包裹的物流单号相同。",
    chineseAliases: ["订单号", "订单编号", "订单号码"],
    englishForms: ["order numbers"],
    en: "Please include your order number in the email.",
    zh: "请在邮件里写上你的订单号。",
    references: ["https://www.ikea.com/us/en/files/pdf/86/db/86db16dd/return_packing_slip_2020.pdf"],
  },
  {
    term: "order status",
    partOfSpeech: "noun phrase",
    meaning: "① 订单状态。表示订单目前处于已确认、处理中、已发货等哪个阶段。",
    chineseAliases: ["订单状态", "订单处理状态", "订单进度"],
    englishForms: ["order statuses"],
    en: "You can check the order status from your account page.",
    zh: "你可以在账户页面查看订单状态。",
    references: ["https://help.shopify.com/en/manual/fulfillment/setup/order-status-page/order-confirmation-numbers"],
  },
  {
    term: "tracking number",
    partOfSpeech: "noun phrase",
    meaning: "① 物流单号；运单号。承运方用于追踪某件货物运输进度的编号，与商家的订单号不同。",
    chineseAliases: ["物流单号", "快递单号", "运单号", "包裹追踪号", "物流追踪号"],
    englishForms: ["tracking numbers"],
    en: "The shipping email contains a tracking number for the parcel.",
    zh: "发货邮件里有这个包裹的物流单号。",
    references: ["https://help.shopify.com/en/manual/fulfillment/fulfilling-orders/adding-tracking-numbers"],
  },
  {
    term: "shipping address",
    partOfSpeech: "noun phrase",
    meaning: "① 收货地址；配送地址。货物需要送达的地点，可能与付款时填写的账单地址不同。",
    chineseAliases: ["收货地址", "配送地址", "送货地址"],
    englishForms: ["shipping addresses"],
    en: "I changed the shipping address before the parcel left the warehouse.",
    zh: "包裹离开仓库之前，我更改了收货地址。",
    references: ["https://help.shopify.com/en/manual/checkout-settings/address-collection-preferences"],
  },
  {
    term: "billing address",
    partOfSpeech: "noun phrase",
    meaning: "① 账单地址。与付款账户或账单相关联的地址，不一定是收货地点。",
    chineseAliases: ["账单地址", "账单寄送地址", "付款账单地址"],
    englishForms: ["billing addresses"],
    en: "My billing address is different from my shipping address.",
    zh: "我的账单地址与收货地址不同。",
    references: ["https://help.shopify.com/en/manual/checkout-settings/address-collection-preferences"],
  },
  {
    term: "order confirmation",
    partOfSpeech: "noun phrase",
    meaning: "① 订单确认；订单确认通知。商家确认收到或接受订单的信息，常以邮件或页面通知的形式出现。",
    chineseAliases: ["订单确认", "订单确认通知", "订单确认邮件"],
    englishForms: ["order confirmations"],
    en: "An order confirmation arrived a few minutes after I paid.",
    zh: "付款几分钟后，我收到了订单确认通知。",
    references: ["https://www.shopify.com/blog/order-history-why-keeping-track-of-customers-previous-orders-can-help-you-make-more-sales"],
  },
  {
    term: "return policy",
    partOfSpeech: "noun phrase",
    meaning: "① 退货政策；退货规定。说明商品是否可以退回，以及退货期限、条件和流程的规则。",
    chineseAliases: ["退货政策", "退货规定", "退货规则"],
    englishForms: ["return policies"],
    en: "I read the return policy before buying the shoes online.",
    zh: "在网上买鞋之前，我阅读了退货政策。",
    references: ["https://help.shopify.com/en/manual/checkout-settings/refund-privacy-tos"],
  },
  {
    term: "return label",
    partOfSpeech: "noun phrase",
    meaning: "① 退货邮寄标签；退货运单标签。贴在退回包裹上的标签，通常包含退货地址及运输信息。",
    chineseAliases: ["退货邮寄标签", "退货标签", "退货运单标签", "退货快递标签"],
    englishForms: ["return labels"],
    en: "The shop emailed me a return label for the damaged lamp.",
    zh: "商店给我发来了退回那盏破损台灯所需的邮寄标签。",
    references: ["https://www.ikea.com/us/en/files/pdf/86/db/86db16dd/return_packing_slip_2020.pdf"],
  },
  {
    term: "proof of purchase",
    partOfSpeech: "noun phrase",
    meaning: "① 购买凭证；购物凭证。能够证明购买行为的材料，如收据、发票或符合商家要求的订单记录，不仅指纸质小票。",
    chineseAliases: ["购买凭证", "购物凭证", "购货凭证", "消费凭证"],
    englishForms: ["proofs of purchase"],
    en: "I kept the receipt as proof of purchase.",
    zh: "我保留了收据作为购买凭证。",
    references: ["https://www.ikea.com/us/en/files/pdf/86/db/86db16dd/return_packing_slip_2020.pdf"],
  },
  {
    term: "full refund",
    partOfSpeech: "noun phrase",
    meaning: "① 全额退款。退回应退金额的全部；是否包含运费等项目，要看具体约定。",
    chineseAliases: ["全额退款", "全额退费", "退还全款"],
    englishForms: ["full refunds"],
    en: "The shop offered a full refund for the cancelled order.",
    zh: "商店提出为那笔已取消的订单全额退款。",
    references: ["https://www.ikea.com/us/en/files/pdf/86/db/86db16dd/return_packing_slip_2020.pdf"],
  },
  {
    term: "delivery fee",
    partOfSpeech: "noun phrase",
    meaning: "① 配送费；送货费。把商品送到指定地点所收取的费用。",
    chineseAliases: ["配送费", "送货费", "配送费用", "送货费用"],
    englishForms: ["delivery fees"],
    en: "The delivery fee appears separately at checkout.",
    zh: "结账时，配送费会单独列出。",
    references: ["https://www.ikea.com/us/en/customer-service/knowledge/articles/8270b46d-88c6-47c7-b74d-99e3ffcegd6c.html"],
  },
  {
    term: "replacement part",
    partOfSpeech: "noun phrase",
    meaning: "① 替换零件；替换配件。用来更换已经损坏、缺失或需要更换的原部件的零件。",
    chineseAliases: ["替换零件", "替换配件", "更换零件", "替换部件"],
    englishForms: ["replacement parts"],
    en: "The manufacturer sent a replacement part for the broken drawer.",
    zh: "制造商寄来了修复那个坏抽屉所需的替换零件。",
    references: ["https://www.ikea.com/us/en/customer-service/spare-parts/?msockid=274301bb4ec365733e3317f74f7264de"],
  },
  {
    term: "refund policy",
    partOfSpeech: "noun phrase",
    meaning: "① 退款政策；退款规定。说明在什么情况下可以退钱、退多少以及如何办理的规则，与退货政策相关但不完全相同。",
    chineseAliases: ["退款政策", "退款规定", "退款规则", "退费政策"],
    englishForms: ["refund policies"],
    en: "The refund policy explains how cancelled bookings are handled.",
    zh: "退款政策说明了取消预订后的处理方式。",
    references: ["https://help.shopify.com/en/manual/checkout-settings/refund-privacy-tos"],
  },
  {
    term: "hand sanitizer",
    partOfSpeech: "noun phrase",
    meaning: "① 免洗手部消毒剂；免洗洗手液。用于手部卫生的免冲洗产品，可有液体、凝胶等形式，区别于需要用水冲洗的普通洗手皂液。",
    chineseAliases: ["免洗手部消毒剂", "免洗洗手液", "手部消毒剂", "免洗手部消毒液"],
    englishForms: ["hand sanitizers", "hand sanitiser", "hand sanitisers"],
    en: "There is a bottle of hand sanitizer beside the entrance.",
    zh: "入口旁放着一瓶免洗洗手液。",
    references: ["https://www.fda.gov/consumers/if-soap-and-water-are-not-available-hand-sanitizers-may-be-good-alternative"],
  },
  {
    term: "isopropyl alcohol",
    partOfSpeech: "noun phrase",
    meaning: "① 异丙醇。一种醇类化合物，可作为某些清洁或消毒产品的成分；这个化学名称本身不等于配制好的消毒酒精产品。",
    chineseAliases: ["异丙醇"],
    englishForms: [],
    en: "The product label lists isopropyl alcohol as an ingredient.",
    zh: "产品标签将异丙醇列为一种成分。",
    references: ["https://dictionary.cambridge.org/dictionary/english/isopropanol"],
  },
  {
    term: "alcohol prep pad",
    partOfSpeech: "noun phrase",
    meaning: "① 酒精消毒棉片；酒精棉片。预先浸有酒精的片状擦拭材料，常见独立包装；不是棉签，也不是棉球。",
    chineseAliases: ["酒精消毒棉片", "酒精棉片", "酒精擦拭片"],
    englishForms: ["alcohol prep pads"],
    en: "The nurse opened a new alcohol prep pad.",
    zh: "护士拆开了一片新的酒精消毒棉片。",
    references: ["https://pdihc.com/products/interventional-care/pdi-alcohol-prep-pads/"],
  },
  {
    term: "alcohol wipe",
    partOfSpeech: "noun phrase",
    meaning: "① 酒精擦片；酒精湿巾。含有酒精的擦拭片或巾状产品；具体用于皮肤还是物体表面，取决于产品种类。",
    chineseAliases: ["酒精擦片", "酒精湿巾", "酒精擦拭巾", "含酒精湿巾"],
    englishForms: ["alcohol wipes"],
    en: "The alcohol wipes in this box are individually wrapped.",
    zh: "这盒酒精擦片每片都有独立包装。",
    references: ["https://pdihc.com/wp-content/uploads/2018/08/SDS-0120-00.pdf"],
  },
  {
    term: "cotton swab",
    partOfSpeech: "noun phrase",
    meaning: "① 棉签；棉棒。细棒的一端或两端包有少量棉花的用品；不是一团棉球，也不表示已经浸有酒精。",
    chineseAliases: ["棉签", "棉棒", "棉花棒"],
    englishForms: ["cotton swabs"],
    en: "The artist used a cotton swab to soften the edge of the drawing.",
    zh: "画家用一根棉签柔化了画面边缘。",
    references: ["https://dictionary.cambridge.org/dictionary/english/cotton-swab"],
  },
  {
    term: "cotton ball",
    partOfSpeech: "noun phrase",
    meaning: "① 棉球；棉花球。一小团球状棉花；这个名称本身不表示棉球已浸过酒精或其他液体。",
    chineseAliases: ["棉球", "棉花球"],
    englishForms: ["cotton balls"],
    en: "She placed a cotton ball in the small glass bowl.",
    zh: "她把一个棉球放进小玻璃碗里。",
    references: ["https://dictionary.cambridge.org/dictionary/english/cotton-ball"],
  },
  {
    term: "disinfectant wipe",
    partOfSpeech: "noun phrase",
    meaning: "① 消毒湿巾；消毒擦拭巾。含消毒成分的擦拭用品，常用于物体表面；不能仅凭这个名称就当作普通手部湿巾。",
    chineseAliases: ["消毒湿巾", "消毒擦拭巾", "消毒擦片"],
    englishForms: ["disinfectant wipes"],
    en: "The office keeps disinfectant wipes in the cleaning cupboard.",
    zh: "办公室把消毒湿巾放在清洁用品柜里。",
    references: ["https://www.clorox.com/products/clorox-disinfecting-wipes/"],
  },
  {
    term: "wet wipe",
    partOfSpeech: "noun phrase",
    meaning: "① 湿巾；湿纸巾。预先湿润、用来擦拭的小片材料，不一定含有酒精或消毒成分。",
    chineseAliases: ["湿巾", "湿纸巾", "清洁湿巾"],
    englishForms: ["wet wipes"],
    en: "She packed wet wipes for the long coach trip.",
    zh: "她为长途客车旅行带上了湿巾。",
    references: ["https://dictionary.cambridge.org/dictionary/english/wet-wipe"],
  },
  {
    term: "liquid soap",
    partOfSpeech: "noun phrase",
    meaning: "① 液体肥皂；皂液。液态的肥皂类清洁产品；用于洗手的产品可称洗手液或洗手皂液，与免洗手部消毒剂不同。",
    chineseAliases: ["液体肥皂", "液体皂", "皂液", "洗手皂液", "洗手液"],
    englishForms: ["liquid soaps"],
    en: "The bathroom has a dispenser filled with liquid soap.",
    zh: "浴室里有一个装着液体肥皂的分配器。",
    references: ["https://dictionary.cambridge.org/us/dictionary/english/soap", "https://dictionary.cambridge.org/us/dictionary/english/hand-soap"],
  },
  {
    term: "adhesive bandage",
    partOfSpeech: "noun phrase",
    meaning: "① 创可贴；自粘创口贴。带有小块敷垫、可粘贴固定的条状或片状敷贴，与卷状绷带不同。",
    chineseAliases: ["创可贴", "创口贴", "自粘创口贴", "黏贴式创伤敷贴"],
    englishForms: ["adhesive bandages"],
    en: "There are several adhesive bandages in the travel pouch.",
    zh: "旅行小包里有几片创可贴。",
    references: ["https://www.band-aid.com/products/adhesive-bandages/flexible-fabric-bandages"],
  },
  {
    term: "medical tape",
    partOfSpeech: "noun phrase",
    meaning: "① 医用胶带；医用胶布。用于医疗护理场景的胶带，不是普通封箱胶带，也不等同于自带敷垫的创可贴。",
    chineseAliases: ["医用胶带", "医用胶布", "医疗胶带"],
    englishForms: ["medical tapes"],
    en: "The travel kit contained medical tape and spare bandages.",
    zh: "旅行用品包里有医用胶带和备用绷带。",
    references: ["https://athome.medline.com/amfile/file/download/file/206/"],
  },
  {
    term: "fabric softener",
    partOfSpeech: "noun phrase",
    meaning: "① 衣物柔顺剂；衣物柔软剂。洗衣时用来使织物柔软的产品，不是负责洗去污渍的洗衣剂。",
    chineseAliases: ["衣物柔顺剂", "衣物柔软剂", "柔顺剂"],
    englishForms: ["fabric softeners"],
    en: "The fabric softener is on the shelf beside the laundry detergent.",
    zh: "衣物柔顺剂放在洗衣剂旁边的架子上。",
    references: ["https://dictionary.cambridge.org/dictionary/english/fabric-softener"],
  },
  {
    term: "rubbing alcohol",
    partOfSpeech: "noun phrase",
    meaning: "① 外用消毒酒精；医用酒精。主要为美式名称，指外用的酒精制品，可含乙醇或异丙醇等；不等于所有纯酒精化学品，也不指饮用酒。",
    chineseAliases: ["消毒酒精", "外用酒精", "外用消毒酒精", "消毒用酒精", "医用酒精"],
    englishForms: [],
    en: "I asked the pharmacist where the rubbing alcohol was kept.",
    zh: "我问药剂师外用消毒酒精放在哪里。",
    references: ["https://dictionary.cambridge.org/dictionary/english/rubbing-alcohol", "https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=5369424a-ccbd-4dc6-af6b-7876484a9fe6", "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=085503dc-7e47-4b55-a57a-c4813c14af8e"],
  },
  {
    term: "surgical spirit",
    partOfSpeech: "noun phrase",
    meaning: "① 医用酒精；外用消毒酒精。主要为英式名称，指外用的含酒精制品；不是饮用烈酒，也不是所有工业用酒精的统称。",
    chineseAliases: ["医用酒精", "消毒酒精", "外用酒精", "外用消毒酒精", "消毒用酒精"],
    englishForms: [],
    en: "The bottle of surgical spirit was on a shelf behind the counter.",
    zh: "那瓶医用酒精放在柜台后面的架子上。",
    references: ["https://dictionary.cambridge.org/us/dictionary/english/surgical-spirit"],
  },
  {
    term: "customer service",
    partOfSpeech: "noun phrase",
    meaning: "① 客户服务；客服。商家在购买前后提供的咨询和问题处理等服务，也可指负责这些工作的部门；不专指某位人工客服。",
    chineseAliases: ["客户服务", "客服", "客服服务", "客户服务部门"],
    englishForms: [],
    en: "Customer service helped us find the missing parcel.",
    zh: "客服部门帮我们找到了丢失的包裹。",
    references: ["https://learn.microsoft.com/en-us/power-platform/architecture/solution-ideas/customer-support-agent"],
  },
  {
    term: "first-aid kit",
    partOfSpeech: "noun phrase",
    meaning: "① 急救包；急救箱。装有基本急救用品的包或箱，具体所含物品因用途和产品而异。",
    chineseAliases: ["急救包", "急救箱", "急救用品包"],
    englishForms: ["first aid kit", "first-aid kits", "first aid kits"],
    en: "We keep a first-aid kit in the car.",
    zh: "我们在车里放着一个急救包。",
    references: ["https://www.band-aid.com/"],
  },
  {
    term: "in stock",
    partOfSpeech: "adjective phrase",
    meaning: "① 有货；有库存。商家目前备有该商品，可以按其销售条件购买。",
    chineseAliases: ["有货", "有库存", "有现货", "现货"],
    englishForms: [],
    en: "The blue jacket is still in stock in my size.",
    zh: "那件蓝色夹克还有我穿的尺码。",
    references: ["https://www.band-aid.com/products/adhesive-bandages/flexible-fabric-bandages"],
  },
  {
    term: "out of stock",
    partOfSpeech: "adjective phrase",
    meaning: "① 缺货；无货；已售罄。商家目前没有该商品的可售库存，不表示永远停产。",
    chineseAliases: ["缺货", "无货", "售罄", "已售罄", "没有现货", "脱销", "卖完了"],
    englishForms: [],
    en: "The charger is out of stock, so I joined the waiting list.",
    zh: "这个充电器目前缺货，所以我加入了到货等候名单。",
    references: ["https://www.band-aid.com/products/adhesive-bandages/flexible-fabric-bandages"],
  },
  {
    term: "laundry detergent",
    partOfSpeech: "noun phrase",
    meaning: "① 洗衣剂；衣物洗涤剂。用于洗涤衣物的产品，剂型可为液体、粉末等；液体产品常称洗衣液，粉状产品常称洗衣粉。",
    chineseAliases: ["洗衣剂", "衣物洗涤剂", "洗衣精", "洗衣液", "洗衣粉"],
    englishForms: ["laundry detergents"],
    en: "The shop sells laundry detergent in both powder and liquid form.",
    zh: "这家店既卖粉状洗衣剂，也卖液体洗衣剂。",
    references: ["https://tide.com/en-us/our-commitment/americas-number-one-detergent/our-products/powder-detergent/how-to-use-powder-detergent"],
  },
  {
    term: "refund",
    partOfSpeech: "noun · verb",
    meaning: "① 退款；退还的款项（名词）。② 退还已付的钱（动词）。这里采用购物、订票等场景中的常用义。",
    chineseAliases: ["退款", "退费", "退还款项", "退还货款", "退钱"],
    englishForms: ["refunds", "refunded", "refunding"],
    en: "The shop refunded the payment after I returned the faulty headphones.",
    zh: "我退回有故障的耳机后，商店退还了货款。",
    references: ["https://www.ikea.com/us/en/files/pdf/86/db/86db16dd/return_packing_slip_2020.pdf"],
  },
  {
    term: "alcohol",
    partOfSpeech: "noun",
    meaning: "① 酒精；日常语境中常指乙醇，化学语境中还可泛指醇类。② 酒；含酒精饮品的统称。具体意思要看上下文，不能把所有消毒产品都称为 alcohol。",
    chineseAliases: ["酒精", "乙醇", "酒类", "含酒精饮品"],
    englishForms: ["alcohols"],
    en: "This drink contains no alcohol.",
    zh: "这种饮料不含酒精。",
    references: ["https://dictionary.cambridge.org/us/dictionary/english/alcohol?topic=specific-chemicals-chemical-compounds-and-gases"],
  },
  {
    term: "disinfectant",
    partOfSpeech: "noun",
    meaning: "① 消毒剂。用于消毒的制剂，日常清洁语境中常指物体表面用的产品。② 消毒液。指液体制品时的常见中文说法；消毒剂不一定含酒精，也不等同于酒精。",
    chineseAliases: ["消毒剂", "消毒液", "表面消毒剂"],
    englishForms: ["disinfectants"],
    en: "The cleaner put the bottle of disinfectant back in the cupboard.",
    zh: "清洁人员把那瓶消毒液放回了柜子。",
    references: ["https://dictionary.cambridge.org/us/dictionary/english/disinfectant", "https://www.cancer.gov/publications/dictionaries/cancer-terms/def/disinfectant"],
  },
  {
    "term": "takeaway",
    "partOfSpeech": "noun",
    "meaning": "① 外卖餐食；从餐馆买来、带到别处吃的食物，常用于英式英语。② 也可指售卖这类食物的店；并不表示一定由骑手送到家。",
    "chineseAliases": [
      "外卖",
      "外卖餐食",
      "外带餐食"
    ],
    "englishForms": [
      "takeaways"
    ],
    "en": "We picked up a takeaway on the way home.",
    "zh": "我们回家途中买了一份外卖。",
    "references": [
      "https://dictionary.cambridge.org/us/dictionary/english/takeaway"
    ]
  },
  {
    "term": "food delivery",
    "partOfSpeech": "noun phrase",
    "meaning": "① 餐食配送；送餐服务。强调把餐食送到指定地点，区别于自己到店取餐。",
    "chineseAliases": [
      "餐食配送",
      "送餐服务",
      "外卖配送"
    ],
    "englishForms": [],
    "en": "Food delivery is available until nine tonight.",
    "zh": "今晚九点前可以使用送餐服务。",
    "references": [
      "https://help.shopify.com/en/manual/intro-to-shopify/initial-setup/move-a-restaurant-online"
    ]
  },
  {
    "term": "eat in",
    "partOfSpeech": "phrasal verb",
    "meaning": "① 堂食；在购买餐食的餐馆或咖啡店里吃。② 在其他语境中也可指在家吃饭；点餐时要结合场景理解。",
    "chineseAliases": [
      "堂食",
      "在店里吃"
    ],
    "englishForms": [
      "eats in",
      "eating in",
      "ate in",
      "eaten in"
    ],
    "en": "Would you like to eat in or take your lunch away?",
    "zh": "你想堂食，还是把午餐带走？",
    "references": [
      "https://www.collinsdictionary.com/dictionary/english/eat-in"
    ]
  },
  {
    "term": "to go",
    "partOfSpeech": "phrase",
    "meaning": "① 外带；打包带走。美式点餐中常用来说明食物或饮料要带到别处享用，不专指把剩菜打包。",
    "chineseAliases": [
      "打包带走",
      "外带",
      "带走吃"
    ],
    "englishForms": [],
    "en": "Could I have these sandwiches to go?",
    "zh": "这些三明治可以给我打包带走吗？",
    "references": [
      "https://dictionary.cambridge.org/us/dictionary/english/takeaway"
    ]
  },
  {
    "term": "doggy bag",
    "partOfSpeech": "noun phrase",
    "meaning": "① 剩菜打包袋或打包盒。餐馆提供的、用来把没吃完的食物带回家的容器；不是普通购物袋。",
    "chineseAliases": [
      "剩菜打包袋",
      "剩菜打包盒"
    ],
    "englishForms": [
      "doggy bags"
    ],
    "en": "We asked for a doggy bag for the rest of the pasta.",
    "zh": "我们要了一个打包盒，把剩下的意大利面带走。",
    "references": [
      "https://dictionary.cambridge.org/dictionary/english/doggy-bag"
    ]
  },
  {
    "term": "pickup order",
    "partOfSpeech": "noun phrase",
    "meaning": "① 自取订单；到店领取的订单。下单后由顾客自己取走，不是送货上门。",
    "chineseAliases": [
      "自取订单",
      "到店自取订单"
    ],
    "englishForms": [
      "pickup orders"
    ],
    "en": "Your pickup order will be ready in twenty minutes.",
    "zh": "你的自取订单二十分钟后就准备好了。",
    "references": [
      "https://help.shopify.com/en/manual/sell-in-person/shopify-pos/order-management/pickup-in-store-for-online-orders"
    ]
  },
  {
    "term": "disposable cutlery",
    "partOfSpeech": "noun phrase",
    "meaning": "① 一次性刀叉勺等餐具。cutlery 主要指进食用的刀、叉、勺；不笼统包括所有杯盘。",
    "chineseAliases": [
      "一次性刀叉勺",
      "一次性刀叉"
    ],
    "englishForms": [],
    "en": "Please leave out the disposable cutlery; I have my own spoon.",
    "zh": "请不要放一次性餐具，我自带了勺子。",
    "references": [
      "https://www.lambeth.gov.uk/business-rates-services-licensing/food-hygiene-standards/ban-single-use-plastic"
    ]
  },
  {
    "term": "paper napkin",
    "partOfSpeech": "noun phrase",
    "meaning": "① 餐巾纸。进餐时用于擦嘴或擦手的纸巾，区别于厨房擦拭用纸或卫生纸。",
    "chineseAliases": [
      "餐巾纸",
      "餐用纸巾"
    ],
    "englishForms": [
      "paper napkins"
    ],
    "en": "There is a paper napkin beside each plate.",
    "zh": "每只盘子旁边都放着一张餐巾纸。",
    "references": [
      "https://assets.cambridge.org/97813166/28317/frontmatter/9781316628317_frontmatter.pdf"
    ]
  },
  {
    "term": "sugar-free",
    "partOfSpeech": "adjective",
    "meaning": "① 无糖的；标示为无糖的食品或饮料。具体含糖量以产品标签和当地标准为准；不等于无热量，也不必然表示没有甜味。",
    "chineseAliases": [
      "无糖",
      "无糖的"
    ],
    "englishForms": [],
    "en": "Do you have a sugar-free version of this drink?",
    "zh": "这种饮料有无糖款吗？",
    "references": []
  },
  {
    "term": "less ice",
    "partOfSpeech": "phrase",
    "meaning": "① 少冰。点饮料时表示希望减少冰块；若想完全不加冰，可说 no ice。",
    "chineseAliases": [
      "少冰",
      "少放冰"
    ],
    "englishForms": [],
    "en": "I would like a large tea with less ice, please.",
    "zh": "请给我一杯大杯茶，少冰。",
    "references": []
  },
  {
    "term": "no ice",
    "partOfSpeech": "phrase",
    "meaning": "① 不加冰；去冰。点饮料时表示不要加入冰块；不等于要求热饮或常温饮品。",
    "chineseAliases": [
      "去冰",
      "不加冰",
      "不要冰块"
    ],
    "englishForms": [],
    "en": "Can I have the orange juice with no ice?",
    "zh": "橙汁可以不加冰吗？",
    "references": []
  },
  {
    "term": "at room temperature",
    "partOfSpeech": "prepositional phrase",
    "meaning": "① 在室温下；常温的。指接近周围室内温度，不是固定的某个温度，也不等于热的。",
    "chineseAliases": [
      "常温",
      "室温下",
      "常温的"
    ],
    "englishForms": [],
    "en": "I would prefer water at room temperature.",
    "zh": "我更想要常温水。",
    "references": []
  },
  {
    "term": "leave a tip",
    "partOfSpeech": "verb phrase",
    "meaning": "① 给小费；付小费。通常是在账单金额之外给服务人员的钱；不自动等同于账单中列出的服务费。",
    "chineseAliases": [
      "给小费",
      "付小费",
      "加小费"
    ],
    "englishForms": [
      "leaves a tip",
      "leaving a tip",
      "left a tip"
    ],
    "en": "We left a tip after paying for dinner.",
    "zh": "我们付完晚餐的钱后给了小费。",
    "references": [
      "https://www.sbs.com.au/language/english/en/podcast-episode/98-splitting-the-bill-med/9cnbvlrfn"
    ]
  },
  {
    "term": "service charge",
    "partOfSpeech": "noun phrase",
    "meaning": "① 服务费。为提供服务而加收的费用，可能列在账单中；是否另付小费要看当地习惯及具体情况。",
    "chineseAliases": [
      "服务费",
      "餐厅服务费"
    ],
    "englishForms": [
      "service charges"
    ],
    "en": "The bill already includes a service charge.",
    "zh": "账单里已经包含了服务费。",
    "references": [
      "https://dictionary.cambridge.org/us/dictionary/english/service-charge"
    ]
  },
  {
    "term": "split the bill",
    "partOfSpeech": "verb phrase",
    "meaning": "① 分摊账单；一起分担费用。可以平均分，也可以按约定分；若要各付各的，应说明 pay separately。",
    "chineseAliases": [
      "分摊账单",
      "分摊饭钱",
      "分担餐费"
    ],
    "englishForms": [
      "splits the bill",
      "splitting the bill"
    ],
    "en": "Shall we split the bill evenly between the three of us?",
    "zh": "我们三个人把账单平均分摊好吗？",
    "references": [
      "https://www.sbs.com.au/language/english/en/podcast-episode/98-splitting-the-bill-med/9cnbvlrfn"
    ]
  },
  {
    "term": "pay separately",
    "partOfSpeech": "verb phrase",
    "meaning": "① 分开结账；各付各的。表示分别支付各自的款项，不一定把总金额平均分。",
    "chineseAliases": [
      "分开结账",
      "各付各的",
      "分别付款"
    ],
    "englishForms": [
      "pays separately",
      "paying separately",
      "paid separately"
    ],
    "en": "We ordered together, but we would like to pay separately.",
    "zh": "我们一起点的餐，但想分开结账。",
    "references": [
      "https://www.sbs.com.au/language/english/en/podcast-episode/98-splitting-the-bill-med/9cnbvlrfn"
    ]
  },
  {
    "term": "pay by card",
    "partOfSpeech": "verb phrase",
    "meaning": "① 用银行卡付款；刷卡付款。泛指使用信用卡或借记卡支付，不限定必须磁条刷卡。",
    "chineseAliases": [
      "刷卡付款",
      "用卡付款",
      "银行卡付款"
    ],
    "englishForms": [
      "pays by card",
      "paying by card",
      "paid by card"
    ],
    "en": "Can I pay by card at this counter?",
    "zh": "这个柜台可以刷卡付款吗？",
    "references": [
      "https://support.google.com/wallet/answer/12060043?hl=en-gb"
    ]
  },
  {
    "term": "pay in cash",
    "partOfSpeech": "verb phrase",
    "meaning": "① 现金付款；用现金支付。区别于银行卡、电子钱包或银行转账。",
    "chineseAliases": [
      "现金付款",
      "现金支付",
      "用现金付款"
    ],
    "englishForms": [
      "pays in cash",
      "paying in cash",
      "paid in cash"
    ],
    "en": "I paid in cash because the card machine was offline.",
    "zh": "因为刷卡机离线了，我用现金付款。",
    "references": []
  },
  {
    "term": "contactless payment",
    "partOfSpeech": "noun phrase",
    "meaning": "① 非接触式付款；感应付款。通常把支持的银行卡或手机靠近终端完成支付，不等同于扫码支付。",
    "chineseAliases": [
      "非接触式付款",
      "非接触支付",
      "感应付款",
      "感应支付"
    ],
    "englishForms": [
      "contactless payments"
    ],
    "en": "This terminal accepts contactless payment.",
    "zh": "这台终端支持感应付款。",
    "references": [
      "https://support.google.com/wallet/answer/12060043?hl=en-gb"
    ]
  },
  {
    "term": "QR code payment",
    "partOfSpeech": "noun phrase",
    "meaning": "① 二维码付款；扫码支付。通过扫描支付二维码或出示付款码完成的付款方式；不等同于感应付款。",
    "chineseAliases": [
      "二维码付款",
      "扫码付款",
      "扫码支付"
    ],
    "englishForms": [
      "QR code payments"
    ],
    "en": "The café offers QR code payment at the counter.",
    "zh": "这家咖啡店的柜台支持扫码支付。",
    "references": []
  },
  {
    "term": "payment failure",
    "partOfSpeech": "noun phrase",
    "meaning": "① 支付失败；付款未能完成。仅表示付款没有成功，不说明具体原因，也不能直接推断银行卡余额不足。",
    "chineseAliases": [
      "支付失败",
      "付款失败"
    ],
    "englishForms": [
      "payment failures"
    ],
    "en": "A connection problem caused the payment failure.",
    "zh": "连接问题导致了这次支付失败。",
    "references": []
  },
  {
    "term": "receipt",
    "partOfSpeech": "noun",
    "meaning": "① 收据；购物小票。证明已经付款或收到物品的纸质或电子凭证；与用于列明费用和请求付款的 invoice 有区别。",
    "chineseAliases": [
      "收据",
      "购物小票",
      "付款收据",
      "电子收据"
    ],
    "englishForms": [
      "receipts"
    ],
    "en": "Please email me the receipt for this purchase.",
    "zh": "请把这次购物的收据发到我的邮箱。",
    "references": [
      "https://www.oxfordlearnersdictionaries.com/us/definition/english/receipt"
    ]
  },
  {
    "term": "invoice",
    "partOfSpeech": "noun; verb",
    "meaning": "① 发票；费用清单或付款通知。通常列明商品或服务及金额；各地税务凭证的具体要求不同，不能一概等同于购物小票。② 给……开具发票或账单。",
    "chineseAliases": [
      "发票",
      "开票",
      "开发票"
    ],
    "englishForms": [
      "invoices",
      "invoiced",
      "invoicing"
    ],
    "en": "The supplier sent an invoice listing the repair costs.",
    "zh": "供应商发来了一张列明维修费用的发票。",
    "references": [
      "https://dictionary.cambridge.org/dictionary/english/invoice?topic=bills-and-invoices"
    ]
  },
  {
    "term": "electronic invoice",
    "partOfSpeech": "noun phrase",
    "meaning": "① 电子发票；以电子形式提供的发票或费用清单。不是所有电子收据都属于 electronic invoice。",
    "chineseAliases": [
      "电子发票"
    ],
    "englishForms": [
      "electronic invoices"
    ],
    "en": "Could you send the electronic invoice to my work email?",
    "zh": "可以把电子发票发到我的工作邮箱吗？",
    "references": [
      "https://dictionary.cambridge.org/dictionary/english/invoice?topic=bills-and-invoices"
    ]
  },
  {
    "term": "self-checkout",
    "partOfSpeech": "noun",
    "meaning": "① 自助结账；自助收银设备或区域。由顾客自己扫描商品并付款，不是线上订单结账的泛称。",
    "chineseAliases": [
      "自助结账",
      "自助收银",
      "自助收银台"
    ],
    "englishForms": [
      "self-checkouts"
    ],
    "en": "I used the self-checkout to pay for a few groceries.",
    "zh": "我在自助收银台买单，付了几样日用品的钱。",
    "references": []
  },
  {
    "term": "discount code",
    "partOfSpeech": "noun phrase",
    "meaning": "① 优惠码；折扣码。在结账时输入、按活动规则获得优惠的代码；优惠内容不一定是免运费。",
    "chineseAliases": [
      "优惠码",
      "折扣码",
      "促销码"
    ],
    "englishForms": [
      "discount codes"
    ],
    "en": "Enter the discount code before you complete the payment.",
    "zh": "付款完成前，请先输入优惠码。",
    "references": [
      "https://help.shopify.com/en/manual/discounts/discount-types/free-shipping"
    ]
  },
  {
    "term": "coupon",
    "partOfSpeech": "noun",
    "meaning": "① 优惠券；折价券。凭券按规则获取折扣或其他优惠，可以是纸质或电子形式。",
    "chineseAliases": [
      "优惠券",
      "折价券"
    ],
    "englishForms": [
      "coupons"
    ],
    "en": "This coupon gives me a discount on my next purchase.",
    "zh": "这张优惠券能让我下次购物时享受折扣。",
    "references": []
  },
  {
    "term": "loyalty points",
    "partOfSpeech": "plural noun phrase",
    "meaning": "① 会员积分；顾客奖励积分。购物或参与活动后获得、按商家规则使用的积分，不等于现金余额。",
    "chineseAliases": [
      "会员积分",
      "购物积分",
      "奖励积分"
    ],
    "englishForms": [],
    "en": "I used my loyalty points to get a small discount.",
    "zh": "我用会员积分抵了一小部分费用。",
    "references": []
  },
  {
    "term": "gift card",
    "partOfSpeech": "noun phrase",
    "meaning": "① 礼品卡。含有可在指定商家消费金额的卡片或电子代码，通常可作为礼物；区别于单纯的优惠券。",
    "chineseAliases": [
      "礼品卡",
      "电子礼品卡"
    ],
    "englishForms": [
      "gift cards"
    ],
    "en": "My sister gave me a gift card for the bookshop.",
    "zh": "姐姐送了我一张这家书店的礼品卡。",
    "references": [
      "https://help.shopify.com/en/manual/products/gift-card-products/manage-purchased-gift-cards"
    ]
  },
  {
    "term": "store credit",
    "partOfSpeech": "noun phrase",
    "meaning": "① 店铺抵用金；商家账户中的可用购物额度。通常只能按规则在该商家使用，不等于已退回银行卡的现金。",
    "chineseAliases": [
      "店铺抵用金",
      "商店抵用金",
      "店铺购物额度"
    ],
    "englishForms": [],
    "en": "I chose store credit instead of a refund to my bank card.",
    "zh": "我选择了店铺抵用金，而不是把退款退到银行卡。",
    "references": [
      "https://help.shopify.com/en/manual/customers/store-credit"
    ]
  },
  {
    "term": "free shipping",
    "partOfSpeech": "noun phrase",
    "meaning": "① 免运费；包邮。指商家不向顾客收取符合条件订单的运输费用，不等于商品免费。",
    "chineseAliases": [
      "免运费",
      "免邮",
      "包邮"
    ],
    "englishForms": [],
    "en": "This order qualifies for free shipping.",
    "zh": "这笔订单符合包邮条件。",
    "references": [
      "https://help.shopify.com/en/manual/discounts/discount-types/free-shipping"
    ]
  },
  {
    "term": "return an item",
    "partOfSpeech": "verb phrase",
    "meaning": "① 退货；把已购买的商品退回商家。是否退款、换货或提供抵用金，需看具体处理方式；退货和退款不是同一个动作。",
    "chineseAliases": [
      "退货",
      "退回商品"
    ],
    "englishForms": [
      "returns an item",
      "returning an item",
      "returned an item"
    ],
    "en": "I would like to return an item that arrived damaged.",
    "zh": "我想退掉一件送来时已经损坏的商品。",
    "references": [
      "https://help.shopify.com/en/manual/fulfillment/managing-orders/returns"
    ]
  },
  {
    "term": "exchange an item",
    "partOfSpeech": "verb phrase",
    "meaning": "① 换货；把商品换成另一件，例如其他尺码或颜色。区别于退回商品后收回货款。",
    "chineseAliases": [
      "换货",
      "更换商品"
    ],
    "englishForms": [
      "exchanges an item",
      "exchanging an item",
      "exchanged an item"
    ],
    "en": "Can I exchange an item for a larger size?",
    "zh": "我可以把这件商品换成大一码的吗？",
    "references": [
      "https://help.shopify.com/en/manual/fulfillment/managing-orders/returns"
    ]
  },
  {
    "term": "return shipping fee",
    "partOfSpeech": "noun phrase",
    "meaning": "① 退货运费。把退货商品寄回商家所产生或收取的运输费用，区别于原订单的配送费。",
    "chineseAliases": [
      "退货运费",
      "退货邮费",
      "寄回运费"
    ],
    "englishForms": [
      "return shipping fees"
    ],
    "en": "Please check who pays the return shipping fee.",
    "zh": "请确认由谁支付退货运费。",
    "references": [
      "https://help.shopify.com/en/manual/fulfillment/managing-orders/returns/return-rules"
    ]
  },
  {
    "term": "partial refund",
    "partOfSpeech": "noun phrase",
    "meaning": "① 部分退款。只退回原付款金额的一部分，区别于全额退款；也不等于购买时的折扣。",
    "chineseAliases": [
      "部分退款",
      "退部分款"
    ],
    "englishForms": [
      "partial refunds"
    ],
    "en": "The shop offered a partial refund for the missing accessory.",
    "zh": "由于少了一件配件，商家提出退回部分款项。",
    "references": [
      "https://help.shopify.com/en/manual/fulfillment/managing-orders/returns"
    ]
  },
  {
    "term": "refund to the original payment method",
    "partOfSpeech": "noun phrase",
    "meaning": "① 原路退款；退回原付款方式的退款。把款项退到原先使用的银行卡或其他付款渠道，区别于店铺抵用金。",
    "chineseAliases": [
      "原路退款",
      "退回原付款方式"
    ],
    "englishForms": [
      "refunds to the original payment method"
    ],
    "en": "I requested a refund to the original payment method.",
    "zh": "我申请了原路退款。",
    "references": [
      "https://help.shopify.com/en/manual/payments/shopify-payments/refunds-troubleshooting"
    ]
  },
  {
    "term": "receive a refund",
    "partOfSpeech": "verb phrase",
    "meaning": "① 收到退款；退款到账。描述收款结果，不代表商家刚发起退款时款项就已经到账。",
    "chineseAliases": [
      "退款到账",
      "退款已收到",
      "收到退款"
    ],
    "englishForms": [
      "receives a refund",
      "receiving a refund",
      "received a refund"
    ],
    "en": "I received a refund for the cancelled order yesterday.",
    "zh": "我昨天收到了那笔已取消订单的退款。",
    "references": [
      "https://help.shopify.com/en/manual/payments/shopify-payments/refunds-troubleshooting"
    ]
  },
  {
    "term": "fitting room",
    "partOfSpeech": "noun phrase",
    "meaning": "① 试衣间；更衣试穿区。商店里供顾客试穿衣服的空间。",
    "chineseAliases": [
      "试衣间",
      "试衣室"
    ],
    "englishForms": [
      "fitting rooms"
    ],
    "en": "I took two jackets into the fitting room.",
    "zh": "我拿了两件夹克到试衣间试穿。",
    "references": [
      "https://i.compasspub.com/userfiles/downloads/Developing_Listening_Skills_2_Answer_Key.pdf"
    ]
  },
  {
    "term": "size chart",
    "partOfSpeech": "noun phrase",
    "meaning": "① 尺码表。列出尺码与身体或商品尺寸之间对应关系的表格；不同品牌可能采用不同标准。",
    "chineseAliases": [
      "尺码表",
      "尺寸对照表"
    ],
    "englishForms": [
      "size charts"
    ],
    "en": "Check the size chart before ordering the trousers.",
    "zh": "订购裤子前先查看尺码表。",
    "references": []
  },
  {
    "term": "back in stock",
    "partOfSpeech": "adjective phrase",
    "meaning": "① 重新有货；补货后恢复供应。表示原本缺货的商品又可以购买了。",
    "chineseAliases": [
      "补货了",
      "重新有货",
      "到货补货",
      "恢复供货"
    ],
    "englishForms": [],
    "en": "The shoes are back in stock in my size.",
    "zh": "这双鞋我穿的尺码已经重新有货了。",
    "references": []
  },
  {
    "term": "restock",
    "partOfSpeech": "verb",
    "meaning": "① 补货；重新补充库存。强调补充商品的动作；back in stock 表示已经重新有货的状态。",
    "chineseAliases": [
      "补货",
      "补充库存"
    ],
    "englishForms": [
      "restocks",
      "restocking",
      "restocked"
    ],
    "en": "The store will restock these notebooks next week.",
    "zh": "商店下周会补充这些笔记本的库存。",
    "references": []
  },
  {
    "term": "pre-order",
    "partOfSpeech": "noun; verb",
    "meaning": "① 预购；预售订单。在商品正式发售或到货之前先下单购买。② 预订尚未正式发售的商品。",
    "chineseAliases": [
      "预购",
      "预售订单"
    ],
    "englishForms": [
      "pre-orders",
      "pre-ordered",
      "pre-ordering"
    ],
    "en": "I placed a pre-order for the new edition.",
    "zh": "我为新版书下了一笔预购订单。",
    "references": []
  },
  {
    "term": "warranty period",
    "partOfSpeech": "noun phrase",
    "meaning": "① 保修期。制造商或卖方承诺按保修条款处理产品问题的一段时间，不表示所有损坏都免费维修。",
    "chineseAliases": [
      "保修期",
      "保修期限"
    ],
    "englishForms": [
      "warranty periods"
    ],
    "en": "The fault appeared within the warranty period.",
    "zh": "故障发生在保修期内。",
    "references": []
  },
  {
    "term": "cancel a subscription",
    "partOfSpeech": "verb phrase",
    "meaning": "① 取消订阅；退订持续提供的服务或内容。是否立即停止服务或到期停止，要看具体条款。",
    "chineseAliases": [
      "取消订阅",
      "退订",
      "取消订阅服务"
    ],
    "englishForms": [
      "cancels a subscription",
      "cancelling a subscription",
      "cancelled a subscription",
      "canceling a subscription",
      "canceled a subscription"
    ],
    "en": "I cancelled a subscription I no longer use.",
    "zh": "我取消了一项不再使用的订阅服务。",
    "references": []
  },
  {
    "term": "automatic renewal",
    "partOfSpeech": "noun phrase",
    "meaning": "① 自动续费；自动续订。订阅或服务到期后按约定自动延续，可能同时收取下一期费用。",
    "chineseAliases": [
      "自动续费",
      "自动续订"
    ],
    "englishForms": [
      "automatic renewals"
    ],
    "en": "I turned off automatic renewal before the next billing date.",
    "zh": "我在下个扣费日前关闭了自动续费。",
    "references": []
  },
  {
    "term": "pay in instalments",
    "partOfSpeech": "verb phrase",
    "meaning": "① 分期付款。把总价分成几次支付；不代表一定免利息或免手续费。",
    "chineseAliases": [
      "分期付款",
      "分期支付"
    ],
    "englishForms": [
      "pay in installments",
      "pays in instalments",
      "paying in instalments",
      "paid in instalments"
    ],
    "en": "They let us pay in instalments over six months.",
    "zh": "他们允许我们在六个月内分期付款。",
    "references": []
  },
  {
    "term": "down payment",
    "partOfSpeech": "noun phrase",
    "meaning": "① 首付款；首付。购买较贵物品时先支付的一部分价款，余款之后支付；不等同于为担保损失而交的押金。",
    "chineseAliases": [
      "首付款",
      "首付"
    ],
    "englishForms": [
      "down payments"
    ],
    "en": "They saved enough for a down payment on a car.",
    "zh": "他们攒够了买车的首付款。",
    "references": []
  },
  {
    "term": "deposit",
    "partOfSpeech": "noun; verb",
    "meaning": "① 押金；作为履约或损坏等事项担保而预先交付的钱。② 订金；预付的部分价款。能否退还及具体法律性质取决于约定和当地规定，不能仅凭英文词判断。③ 存款；把钱存入账户。",
    "chineseAliases": [
      "押金",
      "订金",
      "预付订金"
    ],
    "englishForms": [
      "deposits",
      "deposited",
      "depositing"
    ],
    "en": "We paid a deposit to reserve the table for the group.",
    "zh": "我们付了一笔订金，为这组人预留餐桌。",
    "references": [
      "https://dictionary.cambridge.org/us/dictionary/english/deposit?topic=banks"
    ]
  },
  {
    "term": "queue number",
    "partOfSpeech": "noun phrase",
    "meaning": "① 排队号码；叫号号码。排队服务时用于标识先后顺序的号码，不是预约时间。",
    "chineseAliases": [
      "排队号码",
      "叫号号码",
      "排号"
    ],
    "englishForms": [
      "queue numbers"
    ],
    "en": "Your queue number will appear on the screen.",
    "zh": "屏幕上会显示你的排队号码。",
    "references": []
  },
  {
    "term": "take a number",
    "partOfSpeech": "verb phrase",
    "meaning": "① 取号；领取排队号码。常用于银行、服务柜台等需要叫号办理业务的场所。",
    "chineseAliases": [
      "取号",
      "领取排队号"
    ],
    "englishForms": [
      "takes a number",
      "taking a number",
      "took a number",
      "taken a number"
    ],
    "en": "Please take a number and wait until you are called.",
    "zh": "请先取号，等叫到你时再办理。",
    "references": []
  },
  {
    "term": "opening hours",
    "partOfSpeech": "plural noun phrase",
    "meaning": "① 营业时间；开放时间。指商店或机构对外营业、开放的时段，不是员工个人的上班时间。",
    "chineseAliases": [
      "营业时间",
      "开放时间",
      "店铺营业时间"
    ],
    "englishForms": [],
    "en": "The opening hours are posted on the front door.",
    "zh": "前门上贴着营业时间。",
    "references": []
  },
  {
    "term": "proof of identity",
    "partOfSpeech": "noun phrase",
    "meaning": "① 身份证明；用于证实本人身份的证件或材料。具体接受哪些材料，取决于办理事项及机构要求。",
    "chineseAliases": [
      "身份证明",
      "身份证明材料"
    ],
    "englishForms": [],
    "en": "Please bring proof of identity when you collect the document.",
    "zh": "领取文件时请携带身份证明。",
    "references": []
  },
  {
    "term": "fill in a form",
    "partOfSpeech": "verb phrase",
    "meaning": "① 填表；填写表格。把要求的信息填写进纸质或电子表格；美式英语也常说 fill out a form。",
    "chineseAliases": [
      "填表",
      "填写表格"
    ],
    "englishForms": [
      "fills in a form",
      "filling in a form",
      "filled in a form"
    ],
    "en": "I filled in a form with my contact details.",
    "zh": "我填了一张表，写上自己的联系方式。",
    "references": []
  },
  {
    "term": "scanned copy",
    "partOfSpeech": "noun phrase",
    "meaning": "① 扫描件；扫描得到的电子副本。区别于直接拍下的照片或纸质复印件。",
    "chineseAliases": [
      "扫描件",
      "扫描副本"
    ],
    "englishForms": [
      "scanned copies"
    ],
    "en": "Please upload a scanned copy of the signed page.",
    "zh": "请上传已签字页面的扫描件。",
    "references": []
  },
  {
    "term": "late fee",
    "partOfSpeech": "noun phrase",
    "meaning": "① 逾期费；因未按时付款、归还物品或完成约定事项而收取的额外费用。具体含义须结合账单或服务规则。",
    "chineseAliases": [
      "逾期费",
      "滞纳费用"
    ],
    "englishForms": [
      "late fees"
    ],
    "en": "I returned the book on time to avoid a late fee.",
    "zh": "我按时还书，以免产生逾期费。",
    "references": []
  },
  {
    "term": "box up the leftovers",
    "partOfSpeech": "verb phrase",
    "meaning": "① 把剩菜打包；把没吃完的食物装进盒子带走。box up 强调装盒打包的动作，区别于表示容器的 doggy bag。",
    "chineseAliases": [
      "打包剩菜",
      "把剩菜打包"
    ],
    "englishForms": [
      "boxes up the leftovers",
      "boxing up the leftovers",
      "boxed up the leftovers"
    ],
    "en": "Could you box up the leftovers for us?",
    "zh": "可以帮我们把剩菜打包吗？",
    "references": [
      "https://dictionary.cambridge.org/dictionary/english/doggy-bag"
    ]
  },
  {
    "term": "disposable tableware",
    "partOfSpeech": "noun phrase",
    "meaning": "① 一次性餐具。使用一次后通常丢弃的盘、杯、刀叉勺等用餐用品；范围比只指刀叉勺的 disposable cutlery 更广。",
    "chineseAliases": [
      "一次性餐具",
      "一次性用餐用品"
    ],
    "englishForms": [],
    "en": "We brought reusable plates instead of disposable tableware.",
    "zh": "我们带了可重复使用的盘子，没有用一次性餐具。",
    "references": [
      "https://www.lambeth.gov.uk/business-rates-services-licensing/food-hygiene-standards/ban-single-use-plastic"
    ]
  },
  {
    "term": "change planes",
    "partOfSpeech": "verb phrase",
    "meaning": "① 转机；换乘另一架飞机。指旅途中从一班飞机换到另一班，不是机器转动或事情出现转机。",
    "chineseAliases": [
      "转机",
      "换飞机",
      "换乘飞机"
    ],
    "englishForms": [],
    "en": "We need to change planes in Singapore.",
    "zh": "我们需要在新加坡转机。",
    "references": [
      "https://www.britishairways.com/content/information/airport-information/flight-connections"
    ]
  },
  {
    "term": "connecting flight",
    "partOfSpeech": "noun phrase",
    "meaning": "① 中转航班；衔接的下一程航班。需要与前一班航班接续，不等于仅在机场停留的时间。",
    "chineseAliases": [
      "中转航班",
      "转机航班",
      "衔接航班"
    ],
    "englishForms": [
      "connecting flights"
    ],
    "en": "Our connecting flight leaves from a different terminal.",
    "zh": "我们的中转航班从另一座航站楼起飞。",
    "references": [
      "https://www.britishairways.com/content/information/airport-information/flight-connections"
    ]
  },
  {
    "term": "non-stop flight",
    "partOfSpeech": "noun phrase",
    "meaning": "① 不经停航班；直飞航班。途中不在其他机场降落；订票时用 non-stop 明确表达“不经停”。",
    "chineseAliases": [
      "不经停航班",
      "直飞航班",
      "不停站航班"
    ],
    "englishForms": [
      "non-stop flights",
      "nonstop flight",
      "nonstop flights"
    ],
    "en": "I chose a non-stop flight to avoid changing planes.",
    "zh": "我选择了不经停航班，免去转机。",
    "references": [
      "https://dictionary.cambridge.org/us/dictionary/english/nonstop"
    ]
  },
  {
    "term": "boarding pass",
    "partOfSpeech": "noun phrase",
    "meaning": "① 登机牌；登机证。办理值机后用于登机的纸质或电子凭证，不等于订票确认邮件。",
    "chineseAliases": [
      "登机牌",
      "登机证",
      "电子登机牌"
    ],
    "englishForms": [
      "boarding passes"
    ],
    "en": "I saved my boarding pass on my phone before leaving home.",
    "zh": "出门前，我把登机牌存到了手机上。",
    "references": [
      "https://www.britishairways.com/content/information/airport-information/flight-connections"
    ]
  },
  {
    "term": "departure lounge",
    "partOfSpeech": "noun phrase",
    "meaning": "① 候机厅；候机区。旅客登机前等候的区域，不一定是需要会员资格的贵宾休息室。",
    "chineseAliases": [
      "候机厅",
      "候机区"
    ],
    "englishForms": [
      "departure lounges"
    ],
    "en": "We waited in the departure lounge until the gate opened.",
    "zh": "我们在候机区等候，直到登机口开放。",
    "references": [
      "https://www.britishairways.com/content/information/airport-information/flight-connections"
    ]
  },
  {
    "term": "check in baggage",
    "partOfSpeech": "verb phrase",
    "meaning": "① 办理行李托运；把行李交给航空公司运输。指办理动作，不是把箱子留在寄存处。",
    "chineseAliases": [
      "行李托运",
      "办理行李托运",
      "托运行李办理"
    ],
    "englishForms": [],
    "en": "We need to check in baggage before going through security.",
    "zh": "我们需要先办理行李托运，再过安检。",
    "references": [
      "https://dictionary.cambridge.org/dictionary/english/check-in"
    ]
  },
  {
    "term": "checked baggage",
    "partOfSpeech": "noun phrase",
    "meaning": "① 托运行李。已交给承运方、通常放在飞机货舱运输的行李，与随身带入客舱的行李不同。",
    "chineseAliases": [
      "托运行李",
      "已托运行李"
    ],
    "englishForms": [],
    "en": "My checked baggage arrived on the same flight as me.",
    "zh": "我的托运行李和我乘坐同一航班到达。",
    "references": [
      "https://www.britishairways.com/content/information/help/faq/baggage/stop-overs-and-connections"
    ]
  },
  {
    "term": "carry-on baggage",
    "partOfSpeech": "noun phrase",
    "meaning": "① 随身行李；手提行李。旅客携带进入客舱的行李，不是已经托运的行李。",
    "chineseAliases": [
      "随身行李",
      "手提行李",
      "客舱行李"
    ],
    "englishForms": [],
    "en": "This small bag is my only carry-on baggage.",
    "zh": "这个小包是我唯一的随身行李。",
    "references": [
      "https://www.britishairways.com/content/information/airport-information/flight-connections"
    ]
  },
  {
    "term": "baggage claim",
    "partOfSpeech": "noun phrase",
    "meaning": "① 行李领取处；行李提取区。到达后领取托运行李的区域；美式常用，英式也说 baggage reclaim。",
    "chineseAliases": [
      "行李领取处",
      "行李提取处",
      "行李提取区"
    ],
    "englishForms": [],
    "en": "I will meet you near baggage claim after we land.",
    "zh": "落地后，我会在行李领取处附近和你碰面。",
    "references": [
      "https://www.cph.dk/en/flight-information/transfer"
    ]
  },
  {
    "term": "overweight baggage",
    "partOfSpeech": "noun phrase",
    "meaning": "① 超重行李。重量超过相应限额的行李；excess baggage 的范围还可能包括件数超额，不能只理解为超重。",
    "chineseAliases": [
      "超重行李",
      "行李超重"
    ],
    "englishForms": [],
    "en": "The airline charged an extra fee for my overweight baggage.",
    "zh": "航空公司为我的超重行李收取了额外费用。",
    "references": [
      "https://www.britishairways.com/content/information/help/faq/baggage/stop-overs-and-connections"
    ]
  },
  {
    "term": "miss a flight",
    "partOfSpeech": "verb phrase",
    "meaning": "① 误机；错过航班。没能赶上原本打算乘坐的飞机。",
    "chineseAliases": [
      "误机",
      "错过航班",
      "没赶上飞机"
    ],
    "englishForms": [],
    "en": "We left early because we did not want to miss a flight.",
    "zh": "我们提早出发，因为不想误机。",
    "references": [
      "https://www.britishairways.com/content/information/airport-information/flight-connections"
    ]
  },
  {
    "term": "flight delay",
    "partOfSpeech": "noun phrase",
    "meaning": "① 航班延误；航班晚点。航班未按原定时间起飞或到达，不等于航班取消。",
    "chineseAliases": [
      "航班延误",
      "航班晚点",
      "飞机晚点"
    ],
    "englishForms": [
      "flight delays"
    ],
    "en": "A flight delay meant that we arrived after midnight.",
    "zh": "因为航班延误，我们过了午夜才到达。",
    "references": [
      "https://www.britishairways.com/content/information/airport-information/flight-connections"
    ]
  },
  {
    "term": "check in for a flight",
    "partOfSpeech": "verb phrase",
    "meaning": "① 办理登机手续；值机。向航空公司确认乘机并办理相关手续，不等于已经通过登机口上了飞机。",
    "chineseAliases": [
      "登机手续",
      "办理登机手续",
      "值机",
      "办理值机"
    ],
    "englishForms": [],
    "en": "I prefer to check in for a flight before I reach the airport.",
    "zh": "我更喜欢在到达机场之前办理值机。",
    "references": [
      "https://www.britishairways.com/assets/pdfs/other/prepare-for-travel-checklist.pdf"
    ]
  },
  {
    "term": "one-way ticket",
    "partOfSpeech": "noun phrase",
    "meaning": "① 单程票。只包含单方向行程的车票或机票，不含返程。",
    "chineseAliases": [
      "单程票",
      "单程车票",
      "单程机票"
    ],
    "englishForms": [
      "one-way tickets"
    ],
    "en": "I bought a one-way ticket because my return date was uncertain.",
    "zh": "因为返程日期还没定，我买了一张单程票。",
    "references": [
      "https://dictionary.cambridge.org/dictionary/english/one-way-ticket?topic=tickets"
    ]
  },
  {
    "term": "monthly pass",
    "partOfSpeech": "noun phrase",
    "meaning": "① 月票；月度通行证。可在规定月份或一个月有效期内使用的通行票，具体次数和范围由票种决定。",
    "chineseAliases": [
      "月票",
      "每月通票",
      "月度通行证"
    ],
    "englishForms": [
      "monthly passes"
    ],
    "en": "A monthly pass is cheaper than buying a ticket every day.",
    "zh": "买月票比每天单独买票便宜。",
    "references": [
      "https://www.wmata.com/help/help-topics/fares-and-payment/managing-passes.html",
      "https://tfl.gov.uk/fares/ways-to-pay/travelcards-and-group-tickets"
    ]
  },
  {
    "term": "bus stop",
    "partOfSpeech": "noun phrase",
    "meaning": "① 公交站；公交站台。公交车按线路上下客的指定地点，不是整个公交总站。",
    "chineseAliases": [
      "公交站台",
      "公交站",
      "巴士站"
    ],
    "englishForms": [
      "bus stops"
    ],
    "en": "The bus stop is just outside the library.",
    "zh": "公交站就在图书馆外面。",
    "references": [
      "https://tfl.gov.uk/cdn/static/cms/documents/countdown-sign-evaluation-presentation.pdf"
    ]
  },
  {
    "term": "last bus",
    "partOfSpeech": "noun phrase",
    "meaning": "① 末班公交车；末班车。某条公交线路当天运营的最后一班车，不适用于所有交通工具。",
    "chineseAliases": [
      "末班公交车",
      "最后一班公交车"
    ],
    "englishForms": [
      "last buses"
    ],
    "en": "We checked the time of the last bus before ordering dinner.",
    "zh": "点晚餐之前，我们查了末班公交车的时间。",
    "references": [
      "https://tfl.gov.uk/cdn/static/cms/documents/countdown-sign-evaluation-presentation.pdf"
    ]
  },
  {
    "term": "get off",
    "partOfSpeech": "phrasal verb",
    "meaning": "① 下车。离开公交车、火车等公共交通工具；说从小汽车里出来通常用 get out of。",
    "chineseAliases": [
      "下车",
      "下公交车",
      "下火车"
    ],
    "englishForms": [
      "gets off",
      "got off",
      "getting off"
    ],
    "en": "Get off at the next stop and cross the road.",
    "zh": "在下一站下车，然后过马路。",
    "references": [
      "https://tfl.gov.uk/cdn/static/cms/documents/countdown-sign-evaluation-presentation.pdf"
    ]
  },
  {
    "term": "get off one stop early",
    "partOfSpeech": "verb phrase",
    "meaning": "① 提前一站下车。在原定下车站的前一站离开车辆，不是早一班出发。",
    "chineseAliases": [
      "提前一站下车",
      "早一站下车"
    ],
    "englishForms": [],
    "en": "I decided to get off one stop early and walk the rest of the way.",
    "zh": "我决定提前一站下车，剩下的路步行。",
    "references": [
      "https://tfl.gov.uk/cdn/static/cms/documents/countdown-sign-evaluation-presentation.pdf"
    ]
  },
  {
    "term": "interchange station",
    "partOfSpeech": "noun phrase",
    "meaning": "① 换乘站。旅客可在不同线路或交通服务之间换乘的车站，不表示所有换乘都在同一个站台完成。",
    "chineseAliases": [
      "换乘站",
      "线路换乘站"
    ],
    "englishForms": [
      "interchange stations"
    ],
    "en": "The next stop is an interchange station for two underground lines.",
    "zh": "下一站是两条地铁线路的换乘站。",
    "references": [
      "https://www.thameslinkrailway.com/travel-information/station-information/HWV/heathrow-terminal-5-rail-station-only"
    ]
  },
  {
    "term": "booking confirmation",
    "partOfSpeech": "noun phrase",
    "meaning": "① 预订确认；订房确认。确认预订已记录的邮件或文件；具体是房间、交通或其他服务，要看上下文。",
    "chineseAliases": [
      "订房确认",
      "预订确认",
      "预订确认邮件"
    ],
    "englishForms": [
      "booking confirmations"
    ],
    "en": "The hotel sent a booking confirmation to my email address.",
    "zh": "酒店向我的邮箱发送了订房确认。",
    "references": [
      "https://www.hilton.com/en/help-center/check-in-and-check-out/"
    ]
  },
  {
    "term": "check in at a hotel",
    "partOfSpeech": "verb phrase",
    "meaning": "① 办理酒店入住手续。到酒店登记并确认入住，不等于单纯预订房间。",
    "chineseAliases": [
      "入住手续",
      "办理入住手续",
      "办理酒店入住",
      "酒店入住登记",
      "入住"
    ],
    "englishForms": [],
    "en": "We can check in at a hotel after the afternoon train arrives.",
    "zh": "下午的火车到达后，我们就可以办理酒店入住。",
    "references": [
      "https://www.hilton.com/en/help-center/check-in-and-check-out/"
    ]
  },
  {
    "term": "check out of a hotel",
    "partOfSpeech": "verb phrase",
    "meaning": "① 办理酒店退房；结束住宿并结清相关手续。与提前取消预订不同。",
    "chineseAliases": [
      "退房手续",
      "办理退房手续",
      "酒店退房",
      "办理退房",
      "退房"
    ],
    "englishForms": [],
    "en": "We need to check out of the hotel before going to the station.",
    "zh": "去车站之前，我们需要先办理酒店退房。",
    "references": [
      "https://www.hilton.com/en/help-center/check-in-and-check-out/"
    ]
  },
  {
    "term": "front desk",
    "partOfSpeech": "noun phrase",
    "meaning": "① 前台；接待处。酒店等场所接待来访者、办理登记或解答问题的服务柜台。",
    "chineseAliases": [
      "酒店前台",
      "前台接待处",
      "宾馆前台",
      "前台"
    ],
    "englishForms": [
      "front desks"
    ],
    "en": "The front desk can help us arrange a taxi.",
    "zh": "酒店前台可以帮我们叫出租车。",
    "references": [
      "https://www.hilton.com/en/help-center/check-in-and-check-out/"
    ]
  },
  {
    "term": "late checkout",
    "partOfSpeech": "noun phrase",
    "meaning": "① 延迟退房。获准在酒店正常退房时间之后退房；是否可办理及有无费用要另行确认。",
    "chineseAliases": [
      "延迟退房",
      "延后退房",
      "晚退房"
    ],
    "englishForms": [
      "late check-out"
    ],
    "en": "We asked the hotel whether late checkout was available.",
    "zh": "我们询问酒店能否延迟退房。",
    "references": [
      "https://dictionary.cambridge.org/dictionary/english/checkout",
      "https://www.hilton.com/en/help-center/check-in-and-check-out/"
    ]
  },
  {
    "term": "room service",
    "partOfSpeech": "noun phrase",
    "meaning": "① 客房送餐服务；酒店客房服务。在这里主要指把食物、饮料送到客房的服务，不是清扫房间。",
    "chineseAliases": [
      "客房服务",
      "客房送餐",
      "客房送餐服务"
    ],
    "englishForms": [],
    "en": "We ordered soup through room service after arriving late.",
    "zh": "我们到得很晚，就通过客房送餐服务点了汤。",
    "references": [
      "https://dictionary.cambridge.org/us/dictionary/english/room-service"
    ]
  },
  {
    "term": "key card",
    "partOfSpeech": "noun phrase",
    "meaning": "① 房卡；钥匙卡。用来开启相应门锁的卡片；酒店语境中指房间门卡。",
    "chineseAliases": [
      "房卡",
      "酒店房卡",
      "钥匙卡",
      "客房门卡"
    ],
    "englishForms": [
      "key cards",
      "keycard",
      "keycards"
    ],
    "en": "My key card stopped working, so I went to the front desk.",
    "zh": "我的房卡失效了，于是我去了前台。",
    "references": [
      "https://www.hilton.com/en/help-center/check-in-and-check-out/"
    ]
  },
  {
    "term": "twin room",
    "partOfSpeech": "noun phrase",
    "meaning": "① 双床房。通常指有两张分开的单人床的酒店房间，区别于放一张双人床的房间。",
    "chineseAliases": [
      "双床房",
      "两张单人床的房间"
    ],
    "englishForms": [
      "twin rooms"
    ],
    "en": "We booked a twin room so that we could each have a bed.",
    "zh": "我们订了双床房，这样每个人都能睡一张床。",
    "references": [
      "https://dictionary.cambridge.org/us/dictionary/essential-british-english/twin-room"
    ]
  },
  {
    "term": "room with a double bed",
    "partOfSpeech": "noun phrase",
    "meaning": "① 大床房；有一张双人床的房间。这个完整说法明确床的安排；double room 有时只表示双人入住，预订时仍需确认床型。",
    "chineseAliases": [
      "大床房",
      "双人床房",
      "有双人床的房间"
    ],
    "englishForms": [
      "rooms with a double bed"
    ],
    "en": "We requested a room with a double bed rather than two single beds.",
    "zh": "我们要求的是有一张双人床的房间，而不是两张单人床。",
    "references": [
      "https://assets.cambridge.org/97805217/76882/excerpt/9780521776882_excerpt.pdf"
    ]
  },
  {
    "term": "do not disturb",
    "partOfSpeech": "phrase",
    "meaning": "① 请勿打扰。要求别人暂时不要打断或进入；酒店门牌上常用这个表达。",
    "chineseAliases": [
      "免打扰",
      "请勿打扰"
    ],
    "englishForms": [],
    "en": "I put the do not disturb sign on the door before taking a nap.",
    "zh": "午睡之前，我把请勿打扰的牌子挂到了门上。",
    "references": [
      "https://dohawestbay.intercontinental.com/download/126022"
    ]
  },
  {
    "term": "left-luggage office",
    "partOfSpeech": "noun phrase",
    "meaning": "① 行李寄存处。英式常用，指可付费或按规定暂存行李的地点；不是航空公司的行李托运柜台。",
    "chineseAliases": [
      "行李寄存处",
      "行李寄存柜台"
    ],
    "englishForms": [
      "left-luggage offices"
    ],
    "en": "We left our bags at the left-luggage office while we explored the town.",
    "zh": "游览小镇时，我们把包存放在行李寄存处。",
    "references": [
      "https://dictionary.cambridge.org/dictionary/english/left-luggage-office"
    ]
  },
  {
    "term": "student ID",
    "partOfSpeech": "noun phrase",
    "meaning": "① 学生证；学生身份证明。用于证明学生身份的证件或身份标识；student ID number 则特指学号。",
    "chineseAliases": [
      "学生证",
      "学生身份证明",
      "学生证件"
    ],
    "englishForms": [
      "student IDs"
    ],
    "en": "Please bring your student ID when you visit the campus gym.",
    "zh": "去校园健身房时，请带上学生证。",
    "references": [
      "https://www.unlv.edu/sites/default/files/media/document/2022-04/HOA735-Syllabus.pdf"
    ]
  },
  {
    "term": "library card",
    "partOfSpeech": "noun phrase",
    "meaning": "① 借书证；图书馆读者证。用于借阅或使用相应图书馆服务的证件。",
    "chineseAliases": [
      "借书证",
      "图书馆读者证",
      "图书证"
    ],
    "englishForms": [
      "library cards"
    ],
    "en": "I used my library card to borrow two novels.",
    "zh": "我用借书证借了两本小说。",
    "references": [
      "https://www.cambridgema.gov/iwantto/getalibrarycard"
    ]
  },
  {
    "term": "deadline extension",
    "partOfSpeech": "noun phrase",
    "meaning": "① 延期；截止期限延长。把原定的提交或完成截止日期往后推，不表示任务已自动取消。",
    "chineseAliases": [
      "延长期限",
      "截止日期延期",
      "截止期限延长",
      "延期交作业"
    ],
    "englishForms": [
      "deadline extensions"
    ],
    "en": "I received a deadline extension for the report.",
    "zh": "我获准延后提交报告。",
    "references": [
      "https://www.unlv.edu/sites/default/files/media/document/2022-04/HOA735-Syllabus.pdf"
    ]
  },
  {
    "term": "late submission",
    "partOfSpeech": "noun phrase",
    "meaning": "① 逾期提交；迟交。超过原定截止时间后提交作业或材料，不等于已获批准延期。",
    "chineseAliases": [
      "逾期提交",
      "迟交作业",
      "作业迟交",
      "迟交"
    ],
    "englishForms": [
      "late submissions"
    ],
    "en": "The course page explains the rules for late submission.",
    "zh": "课程页面说明了逾期提交的规定。",
    "references": [
      "https://support.cambridgepub.com/support/solutions/articles/267011-late-submission-penalties"
    ]
  },
  {
    "term": "take time off for personal reasons",
    "partOfSpeech": "verb phrase",
    "meaning": "① 因私人事务请假；请事假。直接说明休假的原因是个人事务，不对应某个国家或机构中特定名称的法定假别。",
    "chineseAliases": [
      "请事假",
      "休事假"
    ],
    "englishForms": [],
    "en": "I need to take time off for personal reasons next Tuesday.",
    "zh": "下周二我需要因私人事务请假。",
    "references": [
      "https://www.ethicalstandards.org.uk/remote-working-policy"
    ]
  },
  {
    "term": "absence",
    "partOfSpeech": "noun",
    "meaning": "① 缺勤；缺课。指应到场却没有到场这件事或相应时段。② 不在；缺席。与表示“缺勤的人”的 absentee 不同。",
    "chineseAliases": [
      "缺勤",
      "缺课",
      "缺席"
    ],
    "englishForms": [
      "absences"
    ],
    "en": "Please explain your absence from yesterday’s class.",
    "zh": "请说明你昨天缺课的原因。",
    "references": [
      "https://www.unlv.edu/policies/instructors"
    ]
  },
  {
    "term": "take attendance",
    "partOfSpeech": "verb phrase",
    "meaning": "① 点名；记录出勤情况。老师或组织者核对谁已到场，也可以通过签到等方式完成。",
    "chineseAliases": [
      "上课点名",
      "课堂点名",
      "记录出勤",
      "课堂考勤"
    ],
    "englishForms": [],
    "en": "The teacher will take attendance before the discussion starts.",
    "zh": "讨论开始前，老师会点名。",
    "references": [
      "https://www.unlv.edu/policies/instructors"
    ]
  },
  {
    "term": "class schedule",
    "partOfSpeech": "noun phrase",
    "meaning": "① 课程表；课表。列明各门课的上课时间安排；不同于介绍课程内容和要求的 syllabus（课程大纲）。",
    "chineseAliases": [
      "课程表",
      "课表",
      "上课时间表"
    ],
    "englishForms": [
      "class schedules"
    ],
    "en": "I checked my class schedule before choosing a meeting time.",
    "zh": "确定开会时间前，我查看了自己的课表。",
    "references": [
      "https://www.collinsdictionary.com/us/dictionary/english/class-schedule"
    ]
  },
  {
    "term": "remote work",
    "partOfSpeech": "noun phrase",
    "meaning": "① 远程办公；远程工作。人在办公室以外通过通讯工具完成工作；地点可以是家，也可以是其他获准地点。",
    "chineseAliases": [
      "远程办公",
      "远程工作"
    ],
    "englishForms": [],
    "en": "Remote work allows our team to collaborate from different cities.",
    "zh": "远程办公让我们的团队可以在不同城市协作。",
    "references": [
      "https://www.ethicalstandards.org.uk/remote-working-policy"
    ]
  },
  {
    "term": "work from home",
    "partOfSpeech": "verb phrase",
    "meaning": "① 居家办公；在家工作。特指工作地点在家，是远程工作的一种情况。",
    "chineseAliases": [
      "居家办公",
      "在家办公",
      "在家工作"
    ],
    "englishForms": [
      "works from home",
      "worked from home",
      "working from home"
    ],
    "en": "I work from home on Fridays and go to the office on other weekdays.",
    "zh": "我周五居家办公，其他工作日去办公室。",
    "references": [
      "https://www.ethicalstandards.org.uk/remote-working-policy"
    ]
  },
  {
    "term": "overtime pay",
    "partOfSpeech": "noun phrase",
    "meaning": "① 加班费。为超出正常工时的工作支付的报酬；这个词本身不限定为双倍工资。",
    "chineseAliases": [
      "加班费",
      "加班工资"
    ],
    "englishForms": [],
    "en": "The payslip lists my overtime pay separately.",
    "zh": "工资单把我的加班费单独列了出来。",
    "references": [
      "https://www.gov.uk/overtime-your-rights/overview"
    ]
  },
  {
    "term": "paid annual leave",
    "partOfSpeech": "noun phrase",
    "meaning": "① 带薪年假。按年度安排、休假期间仍领取相应报酬的假期，不等于病假。",
    "chineseAliases": [
      "带薪年假",
      "带薪年度假期"
    ],
    "englishForms": [],
    "en": "I plan to use some paid annual leave for a family trip.",
    "zh": "我打算用几天带薪年假和家人旅行。",
    "references": [
      "https://www.gov.uk/taking-sick-leave?v=home&v=hrbrief"
    ]
  },
  {
    "term": "commute",
    "partOfSpeech": "verb; noun",
    "meaning": "① 通勤；定期往返于住处和工作地点。② 通勤行程；上下班的路程。这里采用日常出行义。",
    "chineseAliases": [
      "通勤",
      "上下班通勤",
      "通勤路程"
    ],
    "englishForms": [
      "commutes",
      "commuted",
      "commuting"
    ],
    "en": "My daily commute takes about forty minutes by train.",
    "zh": "我每天坐火车通勤大约需要四十分钟。",
    "references": [
      "https://dictionary.cambridge.org/us/dictionary/english/commute"
    ]
  },
  {
    "term": "meeting minutes",
    "partOfSpeech": "noun phrase",
    "meaning": "① 会议纪要；会议记录。对会议讨论事项、决定及待办任务的书面记录，不是“开了多少分钟”。",
    "chineseAliases": [
      "会议纪要",
      "会议记录"
    ],
    "englishForms": [],
    "en": "Please send the meeting minutes to everyone who attended.",
    "zh": "请把会议纪要发给所有参会者。",
    "references": [
      "https://dictionary.cambridge.org/dictionary/english/minutes"
    ]
  },
  {
    "term": "hand over work",
    "partOfSpeech": "verb phrase",
    "meaning": "① 交接工作。把正在负责的任务、材料和相关情况移交给接手的人。",
    "chineseAliases": [
      "交接工作",
      "工作交接"
    ],
    "englishForms": [],
    "en": "I will hand over my work to a colleague before my leave starts.",
    "zh": "休假开始前，我会把工作交接给一位同事。",
    "references": [
      "https://www.ethicalstandards.org.uk/remote-working-policy"
    ]
  },
  {
    "term": "notice period",
    "partOfSpeech": "noun phrase",
    "meaning": "① 离职通知期；通知期。提出辞职或发出终止通知后，到相关安排正式结束之间的期间；具体长短由适用规定或约定决定。",
    "chineseAliases": [
      "离职通知期",
      "辞职通知期",
      "通知期"
    ],
    "englishForms": [
      "notice periods"
    ],
    "en": "I will finish the handover during my notice period.",
    "zh": "我会在离职通知期内完成交接。",
    "references": [
      "https://www.acas.org.uk/resignation/how-to-resign"
    ]
  },
  {
    "term": "emergency contact",
    "partOfSpeech": "noun phrase",
    "meaning": "① 紧急联系人。在紧急情况发生时可以联系的人；不是紧急服务机构的电话号码。",
    "chineseAliases": [
      "紧急联系人",
      "紧急联络人"
    ],
    "englishForms": [
      "emergency contacts"
    ],
    "en": "I listed my sister as my emergency contact.",
    "zh": "我把姐姐填为紧急联系人。",
    "references": [
      "https://housing.unl.edu/sites/unl.edu.student-affairs.university-housing/files/media/file/FY%202026-27%20Housing%20Application%20Guide.pdf"
    ]
  },
  {
    "term": "make an appointment",
    "partOfSpeech": "verb phrase",
    "meaning": "① 预约；约定会面时间。通常指提前安排去见某人或接受某项服务，不等于预约已获确认。",
    "chineseAliases": [
      "预约面谈",
      "预约会面",
      "约见"
    ],
    "englishForms": [],
    "en": "I would like to make an appointment to discuss my course choices.",
    "zh": "我想预约一次面谈，讨论选课。",
    "references": [
      "https://dictionary.cambridge.org/dictionary/english/office-hours?topic=days-and-times-of-day"
    ]
  },
  {
    "term": "request an extension",
    "partOfSpeech": "verb phrase",
    "meaning": "① 申请延期；请求延长期限。提出把截止时间往后推的请求，不表示申请已经获批。",
    "chineseAliases": [
      "申请延期",
      "请求延期",
      "申请延长期限"
    ],
    "englishForms": [],
    "en": "I need to request an extension before the deadline passes.",
    "zh": "我需要在截止时间之前申请延期。",
    "references": [
      "https://www.unlv.edu/sites/default/files/media/document/2022-04/HOA735-Syllabus.pdf"
    ]
  },
  {
    "term": "make-up exam",
    "partOfSpeech": "noun phrase",
    "meaning": "① 补做的考试；因缺考而另行安排的考试。常用于原考试未能参加的情况，区别于不及格后重考；具体制度要看学校规定。",
    "chineseAliases": [
      "补做考试",
      "缺考补考",
      "缺考后的补考",
      "补考"
    ],
    "englishForms": [
      "make-up exams",
      "makeup exam",
      "makeup exams"
    ],
    "en": "The department arranged a make-up exam after my approved absence.",
    "zh": "我的缺考获批后，院系为我安排了补做考试。",
    "references": [
      "https://www.unr.edu/testing-center/faculty"
    ]
  },
  {
    "term": "leave request",
    "partOfSpeech": "noun phrase",
    "meaning": "① 请假申请。向学校、雇主或其他组织提出的休假请求，本身不表示已经批准。",
    "chineseAliases": [
      "请假申请",
      "休假申请"
    ],
    "englishForms": [
      "leave requests"
    ],
    "en": "I submitted a leave request for next Monday.",
    "zh": "我提交了下周一的请假申请。",
    "references": [
      "https://www.ethicalstandards.org.uk/remote-working-policy"
    ]
  },
  {
    "term": "airport transfer",
    "partOfSpeech": "noun phrase",
    "meaning": "① 机场接送；机场与酒店等地点之间的接送服务。这里不是在机场换乘下一班飞机。",
    "chineseAliases": [
      "机场接送",
      "机场接送服务"
    ],
    "englishForms": [
      "airport transfers"
    ],
    "en": "The hotel helped us book an airport transfer for the morning.",
    "zh": "酒店帮我们预订了早上的机场接送服务。",
    "references": [
      "https://www.hilton.com/en/hotels/cunqrhh-hilton-cancun/plan-your-visit/location-transportation/"
    ]
  },
  {
    "term": "sick leave",
    "partOfSpeech": "noun phrase",
    "meaning": "① 病假。因患病而获准不工作或不上课的假期；是否带薪取决于相应制度。",
    "chineseAliases": [
      "病假",
      "因病休假"
    ],
    "englishForms": [],
    "en": "She is on sick leave and will reply when she returns.",
    "zh": "她正在休病假，回来后会回复。",
    "references": [
      "https://www.gov.uk/taking-sick-leave?v=home&v=hrbrief"
    ]
  },
  {
    "term": "office hours",
    "partOfSpeech": "noun phrase",
    "meaning": "① 办公时间；对外办事时间。② 教师答疑时间；教师安排接待学生、讨论课程问题的时段。具体意思取决于工作或学校语境。",
    "chineseAliases": [
      "教师答疑时间",
      "教授答疑时间",
      "老师答疑时间",
      "答疑时间",
      "教师答疑",
      "老师答疑"
    ],
    "englishForms": [],
    "en": "I will ask the professor about the assignment during office hours.",
    "zh": "我会在答疑时间向教授请教作业问题。",
    "references": [
      "https://dictionary.cambridge.org/dictionary/english/office-hours?topic=days-and-times-of-day"
    ]
  },
  {
    "term": "last service",
    "partOfSpeech": "noun phrase",
    "meaning": "① 末班车；最后一班交通服务。可用于火车、公交等时刻表语境，具体交通方式由上下文决定。",
    "chineseAliases": [
      "末班车",
      "最后一班车"
    ],
    "englishForms": [
      "last services"
    ],
    "en": "We checked the timetable to make sure we would not miss the last service.",
    "zh": "我们查了时刻表，确保不会错过末班车。",
    "references": [
      "https://www.thameslinkrailway.com/service-updates/service-updates?uq=639176644681790000"
    ]
  },
  {
    "term": "power strip",
    "partOfSpeech": "noun phrase",
    "meaning": "① 插线板；排插。带有多个电源插孔、通常连着一根电线的插座装置。普通插线板不一定有防浪涌功能。",
    "chineseAliases": [
      "插线板",
      "排插",
      "多孔插线板",
      "插排"
    ],
    "englishForms": [
      "power strips"
    ],
    "en": "I need a power strip with a longer cord.",
    "zh": "我需要一个电线更长的插线板。",
    "references": [
      "https://www.belkin.com/products/surge-protectors/power-strips/"
    ]
  },
  {
    "term": "travel adapter",
    "partOfSpeech": "noun phrase",
    "meaning": "① 旅行转换插头。让一种规格的电源插头适配另一种插座的装置；不等于变压器。",
    "chineseAliases": [
      "转换插头",
      "旅行转换插头",
      "插头转换器"
    ],
    "englishForms": [
      "travel adapters",
      "travel adaptor",
      "travel adaptors"
    ],
    "en": "I packed a travel adapter for my laptop charger.",
    "zh": "我给笔记本电脑充电器带了一个旅行转换插头。",
    "references": [
      "https://www.anker.com/collections/travel-adapter"
    ]
  },
  {
    "term": "power bank",
    "partOfSpeech": "noun phrase",
    "meaning": "① 充电宝；移动电源。储存电能、可携带并为手机等设备充电的电池装置。",
    "chineseAliases": [
      "充电宝",
      "移动电源"
    ],
    "englishForms": [
      "power banks"
    ],
    "en": "My power bank is in the front pocket of my bag.",
    "zh": "我的充电宝在包的前袋里。",
    "references": [
      "https://www.anker.com/collections/travel-essentials"
    ]
  },
  {
    "term": "phone charger",
    "partOfSpeech": "noun phrase",
    "meaning": "① 手机充电器。为手机提供充电电力的装置；单独的充电线不一定包含充电器。",
    "chineseAliases": [
      "手机充电器"
    ],
    "englishForms": [
      "phone chargers"
    ],
    "en": "Did I leave my phone charger by the bed?",
    "zh": "我是不是把手机充电器落在床边了？",
    "references": [
      "https://www.anker.com/collections/travel-essentials"
    ]
  },
  {
    "term": "data cable",
    "partOfSpeech": "noun phrase",
    "meaning": "① 数据线。连接设备以传输数据的线缆；部分数据线也能给设备充电。",
    "chineseAliases": [
      "数据线",
      "数据传输线"
    ],
    "englishForms": [
      "data cables"
    ],
    "en": "This data cable connects my camera to my computer.",
    "zh": "这根数据线把我的相机连接到电脑上。",
    "references": [
      "https://support.apple.com/en-mo/guide/iphone/ipheb425c7c4/ios"
    ]
  },
  {
    "term": "charging cable",
    "partOfSpeech": "noun phrase",
    "meaning": "① 充电线。连接电源和设备以充电的线缆；是否支持数据传输，要看具体线缆。",
    "chineseAliases": [
      "充电线",
      "充电用线"
    ],
    "englishForms": [
      "charging cables"
    ],
    "en": "The charging cable is too short to reach the desk.",
    "zh": "这根充电线太短，够不到书桌。",
    "references": [
      "https://support.apple.com/en-mo/guide/iphone/ipheb425c7c4/ios"
    ]
  },
  {
    "term": "wireless charger",
    "partOfSpeech": "noun phrase",
    "meaning": "① 无线充电器。通过兼容的无线充电方式给设备充电的装置。",
    "chineseAliases": [
      "无线充电器",
      "无线充电座"
    ],
    "englishForms": [
      "wireless chargers"
    ],
    "en": "I placed my phone on the wireless charger.",
    "zh": "我把手机放到了无线充电器上。",
    "references": [
      "https://www.belkin.com/products/surge-protectors/power-strips/"
    ]
  },
  {
    "term": "mobile data",
    "partOfSpeech": "noun",
    "meaning": "① 移动数据；手机流量。手机通过运营商的移动通信网络使用的数据服务或数据用量，区别于通过Wi-Fi联网。",
    "chineseAliases": [
      "移动数据",
      "手机流量",
      "蜂窝数据"
    ],
    "englishForms": [],
    "en": "I turned off mobile data before opening the video.",
    "zh": "打开视频之前，我关闭了移动数据。",
    "references": [
      "https://support.apple.com/en-us/102433"
    ]
  },
  {
    "term": "Wi-Fi network",
    "partOfSpeech": "noun phrase",
    "meaning": "① Wi-Fi网络；日常联网语境中的无线局域网。家中、学校等通过Wi-Fi连接的网络；无线网络这个大类不只包括Wi-Fi。",
    "chineseAliases": [
      "WiFi网络",
      "无线局域网"
    ],
    "englishForms": [
      "Wi-Fi networks",
      "WiFi network",
      "WiFi networks"
    ],
    "en": "Which Wi-Fi network should I connect to?",
    "zh": "我应该连接哪个无线网络？",
    "references": [
      "https://support.apple.com/en-us/102433"
    ]
  },
  {
    "term": "personal hotspot",
    "partOfSpeech": "noun phrase",
    "meaning": "① 个人热点；手机热点。把手机等设备的联网连接共享给其他设备使用的功能或临时网络。",
    "chineseAliases": [
      "个人热点",
      "手机热点",
      "移动热点"
    ],
    "englishForms": [
      "personal hotspots"
    ],
    "en": "Could you turn on your personal hotspot for a moment?",
    "zh": "你能把个人热点打开一会儿吗？",
    "references": [
      "https://support.apple.com/en-us/111785"
    ]
  },
  {
    "term": "internet speed",
    "partOfSpeech": "noun phrase",
    "meaning": "① 网速；互联网连接速度。日常用于描述上网时数据传输的快慢，不等同于Wi-Fi信号强弱。",
    "chineseAliases": [
      "网速",
      "上网速度",
      "网络速度"
    ],
    "englishForms": [
      "internet speeds"
    ],
    "en": "The internet speed is slower in the evening.",
    "zh": "晚上的网速比较慢。",
    "references": [
      "https://www.tp-link.com/us/support/faq/2435/"
    ]
  },
  {
    "term": "Ethernet cable",
    "partOfSpeech": "noun phrase",
    "meaning": "① 以太网线；日常所说的网线。用于有线网络连接的线缆，区别于电源线或普通手机充电线。",
    "chineseAliases": [
      "网线",
      "以太网线",
      "有线网线"
    ],
    "englishForms": [
      "Ethernet cables"
    ],
    "en": "I connected the desktop computer with an Ethernet cable.",
    "zh": "我用网线把台式电脑连接到了网络。",
    "references": [
      "https://static.tp-link.com/cat5e_datasheet_1476778172295s.pdf"
    ]
  },
  {
    "term": "Bluetooth headphones",
    "partOfSpeech": "noun phrase",
    "meaning": "① 蓝牙耳机。通过蓝牙连接设备的耳机；是否有降噪功能，要看具体产品。",
    "chineseAliases": [
      "蓝牙耳机"
    ],
    "englishForms": [],
    "en": "My Bluetooth headphones are connected to the wrong phone.",
    "zh": "我的蓝牙耳机连到了另一部手机上。",
    "references": [
      "https://www.soundcore.com/collections/headphones"
    ]
  },
  {
    "term": "noise-cancelling headphones",
    "partOfSpeech": "noun phrase",
    "meaning": "① 降噪耳机。用降噪技术减弱环境噪声的耳机；不表示能完全隔绝所有声音。",
    "chineseAliases": [
      "降噪耳机",
      "主动降噪耳机"
    ],
    "englishForms": [
      "noise-canceling headphones"
    ],
    "en": "I wore noise-cancelling headphones while studying.",
    "zh": "学习时，我戴了降噪耳机。",
    "references": [
      "https://www.soundcore.com/collections/headphones"
    ]
  },
  {
    "term": "verification code",
    "partOfSpeech": "noun phrase",
    "meaning": "① 验证码。系统让用户输入或确认、用来核实身份或操作的代码；不一定都是一次性密码。",
    "chineseAliases": [
      "验证码",
      "验证代码"
    ],
    "englishForms": [
      "verification codes"
    ],
    "en": "The verification code arrived a minute later.",
    "zh": "验证码过了一分钟才发来。",
    "references": [
      "https://support.apple.com/en-us/102660"
    ]
  },
  {
    "term": "one-time password",
    "partOfSpeech": "noun phrase",
    "meaning": "① 一次性密码。只用于一次验证或一次登录的临时密码，常缩写为OTP。",
    "chineseAliases": [
      "一次性密码",
      "一次性口令"
    ],
    "englishForms": [
      "one-time passwords"
    ],
    "en": "The one-time password expired before I could enter it.",
    "zh": "我还没来得及输入，一次性密码就过期了。",
    "references": [
      "https://learn.microsoft.com/en-us/entra/identity/authentication/concept-authentication-oath-tokens"
    ]
  },
  {
    "term": "recycle bin",
    "partOfSpeech": "noun phrase",
    "meaning": "① 回收站（电脑）。系统中暂时存放已删除文件的位置，不是现实中的废品回收站。",
    "chineseAliases": [
      "电脑回收站",
      "文件回收站",
      "系统回收站"
    ],
    "englishForms": [
      "recycle bins"
    ],
    "en": "I found the deleted document in the recycle bin.",
    "zh": "我在回收站里找到了删掉的文件。",
    "references": [
      "https://support.microsoft.com/en-us/windows/experience/storage-filemanagement/manage-drive-space-with-storage-sense"
    ]
  },
  {
    "term": "power-saving mode",
    "partOfSpeech": "noun phrase",
    "meaning": "① 省电模式；节电模式。通过限制部分功能或降低耗电来延长设备续航的设置。",
    "chineseAliases": [
      "省电模式",
      "节电模式"
    ],
    "englishForms": [
      "power-saving modes"
    ],
    "en": "I switched to power-saving mode on the train.",
    "zh": "在火车上，我开启了省电模式。",
    "references": [
      "https://support.apple.com/en-lamr/101604"
    ]
  },
  {
    "term": "airplane mode",
    "partOfSpeech": "noun phrase",
    "meaning": "① 飞行模式。手机等设备上用于关闭或限制无线通信的模式；具体关闭哪些连接取决于设备和设置。",
    "chineseAliases": [
      "飞行模式"
    ],
    "englishForms": [],
    "en": "Please put your phone in airplane mode.",
    "zh": "请把手机调成飞行模式。",
    "references": [
      "https://support.apple.com/en-gb/108785"
    ]
  },
  {
    "term": "automatic update",
    "partOfSpeech": "noun phrase",
    "meaning": "① 自动更新。软件或系统自动下载或安装新版内容的更新方式，也可指一次自动进行的更新。",
    "chineseAliases": [
      "自动更新",
      "软件自动更新"
    ],
    "englishForms": [
      "automatic updates"
    ],
    "en": "I paused automatic updates while using mobile data.",
    "zh": "使用手机流量时，我暂停了自动更新。",
    "references": [
      "https://support.apple.com/en-us/102433"
    ]
  },
  {
    "term": "factory reset",
    "partOfSpeech": "noun phrase",
    "meaning": "① 恢复出厂设置；出厂重置。把设备重置到接近初始设置的操作，通常会移除用户数据或设置。",
    "chineseAliases": [
      "恢复出厂设置",
      "出厂重置",
      "恢复出厂设定"
    ],
    "englishForms": [
      "factory resets"
    ],
    "en": "I backed up my photos before the factory reset.",
    "zh": "恢复出厂设置之前，我备份了照片。",
    "references": [
      "https://www.samsung.com/us/support/answer/ANS10002030/"
    ]
  },
  {
    "term": "storage space",
    "partOfSpeech": "noun phrase",
    "meaning": "① 存储空间。设备或存储介质上用于保存文件、应用等数据的空间，区别于运行程序用的内存。",
    "chineseAliases": [
      "存储空间",
      "手机存储空间",
      "硬盘空间"
    ],
    "englishForms": [],
    "en": "There is not enough storage space for the video.",
    "zh": "存储空间不足，保存不了这个视频。",
    "references": [
      "https://support.microsoft.com/en-us/windows/experience/storage-filemanagement/free-up-drive-space-in-windows"
    ]
  },
  {
    "term": "duvet cover",
    "partOfSpeech": "noun phrase",
    "meaning": "① 被套。套在被芯外面、可以拆下来清洗的外罩；不是床单或被芯。",
    "chineseAliases": [
      "被套",
      "被罩"
    ],
    "englishForms": [
      "duvet covers"
    ],
    "en": "I washed the duvet cover and pillowcases today.",
    "zh": "今天我洗了被套和枕套。",
    "references": [
      "https://www.ikea.com/us/en/cat/bedlinen-10651/"
    ]
  },
  {
    "term": "mattress protector",
    "partOfSpeech": "noun phrase",
    "meaning": "① 床垫保护套；床垫保护垫。罩在或铺在床垫上用于保护床垫的用品，不等同于普通床单。",
    "chineseAliases": [
      "床垫保护套",
      "床垫保护垫"
    ],
    "englishForms": [
      "mattress protectors"
    ],
    "en": "The mattress protector goes under the sheet.",
    "zh": "床垫保护垫铺在床单下面。",
    "references": [
      "https://www.ikea.com/us/en/cat/mattress-protectors-24824/"
    ]
  },
  {
    "term": "dishwasher detergent",
    "partOfSpeech": "noun phrase",
    "meaning": "① 洗碗机洗涤剂。供洗碗机使用的洗涤产品，可有粉末、凝胶、洗涤块等形式；不是普通手洗洗洁精。",
    "chineseAliases": [
      "洗碗机洗涤剂",
      "洗碗机专用洗涤剂"
    ],
    "englishForms": [
      "dishwasher detergents"
    ],
    "en": "We keep the dishwasher detergent in the kitchen cupboard.",
    "zh": "我们把洗碗机洗涤剂放在厨房橱柜里。",
    "references": [
      "https://cascadeclean.ca/en-ca/how-to/cascade-faq/how-to-use-cascade-dishwasher-detergent/"
    ]
  },
  {
    "term": "facial tissue",
    "partOfSpeech": "noun phrase",
    "meaning": "① 面巾纸；擦脸或擤鼻涕用的柔软纸巾。日常所说的抽纸常属于这一类，不等同于湿巾或卫生纸。",
    "chineseAliases": [
      "抽纸",
      "面巾纸",
      "抽取式面巾纸"
    ],
    "englishForms": [
      "facial tissues"
    ],
    "en": "There is a box of facial tissues on the table.",
    "zh": "桌上有一盒抽纸。",
    "references": [
      "https://www.kleenex.com/en-us/"
    ]
  },
  {
    "term": "aluminium foil",
    "partOfSpeech": "noun",
    "meaning": "① 铝箔；日常厨房里常称锡纸的薄金属箔。现代常用的这类厨房锡纸通常是铝箔。",
    "chineseAliases": [
      "锡纸",
      "铝箔",
      "厨房铝箔"
    ],
    "englishForms": [
      "aluminum foil"
    ],
    "en": "I covered the tray with aluminium foil.",
    "zh": "我用铝箔盖住了托盘。",
    "references": [
      "https://www.reynoldsbrands.com/tips-and-how-tos/aluminum-foil-guide"
    ]
  },
  {
    "term": "food storage bag",
    "partOfSpeech": "noun phrase",
    "meaning": "① 食品保鲜袋；食品储存袋。用来装存食物的袋子，不一定有可重复封口的结构。",
    "chineseAliases": [
      "保鲜袋",
      "食品保鲜袋",
      "食品储存袋"
    ],
    "englishForms": [
      "food storage bags"
    ],
    "en": "I put the sliced bread in a food storage bag.",
    "zh": "我把切片面包装进了保鲜袋。",
    "references": [
      "https://www.ikea.com/us/en/cat/food-storage-accessories-resealable-bags-700611/"
    ]
  },
  {
    "term": "food storage container",
    "partOfSpeech": "noun phrase",
    "meaning": "① 食品保鲜盒；食品储存容器。用于存放食物的盒或容器；能否密封、冷冻或加热要看具体产品。",
    "chineseAliases": [
      "保鲜盒",
      "食品保鲜盒",
      "食品储存盒"
    ],
    "englishForms": [
      "food storage containers"
    ],
    "en": "The leftovers are in a food storage container.",
    "zh": "剩菜装在一个保鲜盒里。",
    "references": [
      "https://www.ikea.com/us/en/cat/food-containers-20606/"
    ]
  },
  {
    "term": "resealable bag",
    "partOfSpeech": "noun phrase",
    "meaning": "① 可重复封口袋；自封袋。打开后仍可重新封合的袋子；并非所有保鲜袋都有这种封口。",
    "chineseAliases": [
      "自封袋",
      "可重复封口袋"
    ],
    "englishForms": [
      "resealable bags"
    ],
    "en": "I keep spare buttons in a small resealable bag.",
    "zh": "我把备用纽扣放在一个小自封袋里。",
    "references": [
      "https://www.ikea.com/us/en/cat/food-storage-accessories-resealable-bags-700611/"
    ]
  },
  {
    "term": "dehumidifier",
    "partOfSpeech": "noun",
    "meaning": "① 除湿机；抽湿机。降低空气中湿气的设备，区别于向空气增加水分的加湿器。",
    "chineseAliases": [
      "除湿机",
      "抽湿机",
      "除湿器"
    ],
    "englishForms": [
      "dehumidifiers"
    ],
    "en": "The dehumidifier is running in the laundry room.",
    "zh": "洗衣房里的除湿机正在运转。",
    "references": [
      "https://dictionary.cambridge.org/dictionary/english/dehumidifier?topic=vents-and-ventilation"
    ]
  },
  {
    "term": "humidifier",
    "partOfSpeech": "noun",
    "meaning": "① 加湿器。向空气增加水分、提高湿度的设备，区别于除湿机。",
    "chineseAliases": [
      "加湿器",
      "空气加湿器"
    ],
    "englishForms": [
      "humidifiers"
    ],
    "en": "The humidifier is on the shelf near the window.",
    "zh": "加湿器放在靠窗的架子上。",
    "references": [
      "https://crane-usa.com/shop/"
    ]
  },
  {
    "term": "air purifier",
    "partOfSpeech": "noun phrase",
    "meaning": "① 空气净化器。用于减少空气中某些颗粒或污染物的设备；不等同于加湿器或除湿机。",
    "chineseAliases": [
      "空气净化器",
      "空气净化机"
    ],
    "englishForms": [
      "air purifiers"
    ],
    "en": "I replaced the filter in the air purifier.",
    "zh": "我更换了空气净化器里的滤芯。",
    "references": [
      "https://crane-usa.com/shop/"
    ]
  },
  {
    "term": "robot vacuum cleaner",
    "partOfSpeech": "noun phrase",
    "meaning": "① 扫地机器人；机器人吸尘器。能够自动移动并清理地面的吸尘设备；不是所有型号都能拖地。",
    "chineseAliases": [
      "扫地机器人",
      "机器人吸尘器"
    ],
    "englishForms": [
      "robot vacuum cleaners"
    ],
    "en": "The robot vacuum cleaner got stuck under the chair.",
    "zh": "扫地机器人卡在椅子下面了。",
    "references": [
      "https://us.eufy.com/collections/robot-vacuums"
    ]
  },
  {
    "term": "dustpan",
    "partOfSpeech": "noun",
    "meaning": "① 簸箕；畚箕。扫地时用来盛接灰尘和垃圾的工具。",
    "chineseAliases": [
      "簸箕",
      "畚箕",
      "垃圾铲"
    ],
    "englishForms": [
      "dustpans"
    ],
    "en": "Please hold the dustpan while I sweep up the crumbs.",
    "zh": "我扫面包屑时，请帮我拿着簸箕。",
    "references": [
      "https://www.ikea.com/us/en/cat/cleaning-accessories-20609/"
    ]
  },
  {
    "term": "laundry basket",
    "partOfSpeech": "noun phrase",
    "meaning": "① 洗衣篮；衣物篮。用来盛放或搬运待洗、洗过的衣物的篮子。",
    "chineseAliases": [
      "洗衣篮",
      "脏衣篮",
      "衣物篮"
    ],
    "englishForms": [
      "laundry baskets"
    ],
    "en": "Put your dirty socks in the laundry basket.",
    "zh": "把脏袜子放进洗衣篮里。",
    "references": [
      "https://www.ikea.com/us/en/cat/bathroom-laundry-ba003/"
    ]
  },
  {
    "term": "stain remover",
    "partOfSpeech": "noun phrase",
    "meaning": "① 去渍剂；污渍去除剂。用来帮助去除衣物等物品上污渍的产品，不等同于柔顺剂。",
    "chineseAliases": [
      "污渍去除剂",
      "去渍剂",
      "衣物去渍剂"
    ],
    "englishForms": [
      "stain removers"
    ],
    "en": "I bought a stain remover for the mark on my shirt.",
    "zh": "我买了一瓶去渍剂，想去掉衬衫上的污渍。",
    "references": [
      "https://assets.ctfassets.net/xsotn7jngs35/37QvuxEDXFVCp8hHozIqkH/11cebaa9a9a7a77310cfebec017c8674/OPL_-_Laundry_Stain_Removal_Guide__Tide_Multi-Purpose_Stain_Remover_Spray__Rust_Stain_Remover_Spray__Stain_Removal_Treatment.pdf"
    ]
  },
  {
    "term": "cleaning sponge",
    "partOfSpeech": "noun phrase",
    "meaning": "① 清洁海绵。擦洗物品或表面的海绵用品；是否适合某种表面要看具体产品。",
    "chineseAliases": [
      "清洁海绵"
    ],
    "englishForms": [
      "cleaning sponges"
    ],
    "en": "The cleaning sponge is next to the sink.",
    "zh": "清洁海绵放在水槽旁边。",
    "references": [
      "https://www.ikea.com/us/en/cat/cleaning-accessories-20609/"
    ]
  },
  {
    "term": "rubber gloves",
    "partOfSpeech": "noun phrase",
    "meaning": "① 橡胶手套。由橡胶材料制成的手套，家务语境中常指洗碗、清洁时戴的手套。",
    "chineseAliases": [
      "橡胶手套",
      "家务橡胶手套"
    ],
    "englishForms": [
      "rubber glove"
    ],
    "en": "I wore rubber gloves while washing the dishes.",
    "zh": "洗碗时，我戴了橡胶手套。",
    "references": [
      "https://espanol.rosettastone.com/tarjetas-de-estudio/equipo-para-tareas-del-hogar?lang=en-US"
    ]
  },
  {
    "term": "toilet brush",
    "partOfSpeech": "noun phrase",
    "meaning": "① 马桶刷。用于刷洗马桶内部的刷子。",
    "chineseAliases": [
      "马桶刷",
      "坐便器刷"
    ],
    "englishForms": [
      "toilet brushes"
    ],
    "en": "The toilet brush is in a holder behind the toilet.",
    "zh": "马桶刷放在马桶后面的刷架里。",
    "references": [
      "https://www.ikea.com/us/en/cat/toilet-brushes-48944/"
    ]
  },
  {
    "term": "shower head",
    "partOfSpeech": "noun phrase",
    "meaning": "① 淋浴喷头；花洒头。淋浴装置中将水喷洒出来的部件。",
    "chineseAliases": [
      "淋浴喷头",
      "花洒",
      "花洒头"
    ],
    "englishForms": [
      "shower heads",
      "showerhead",
      "showerheads"
    ],
    "en": "The shower head has several spray settings.",
    "zh": "这个淋浴喷头有好几种喷水模式。",
    "references": [
      "https://www.grohe.us/collections/shower-heads-list"
    ]
  },
  {
    "term": "spare battery",
    "partOfSpeech": "noun phrase",
    "meaning": "① 备用电池。留作替换或额外使用的电池；不特指给手机充电的充电宝。",
    "chineseAliases": [
      "备用电池",
      "替换备用电池"
    ],
    "englishForms": [
      "spare batteries"
    ],
    "en": "I packed a spare battery for the camera.",
    "zh": "我给相机带了一块备用电池。",
    "references": [
      "https://www.usa.canon.com/shop/pro/cameras/camera-accessories/batteries"
    ]
  },
  {
    "term": "extension cord",
    "partOfSpeech": "noun phrase",
    "meaning": "① 电源延长线。把电源连接延伸到更远位置的线；不一定带有多个插孔。",
    "chineseAliases": [
      "延长线",
      "电源延长线",
      "电线延长线"
    ],
    "englishForms": [
      "extension cords"
    ],
    "en": "The extension cord is coiled in the drawer.",
    "zh": "电源延长线盘好放在抽屉里。",
    "references": [
      "https://dictionary.cambridge.org/dictionary/english/extension-lead"
    ]
  },
  {
    "term": "electricity bill",
    "partOfSpeech": "noun phrase",
    "meaning": "① 电费账单。列出某个计费周期用电费用等信息的账单；也常用于说电费金额。",
    "chineseAliases": [
      "电费账单",
      "电费单",
      "用电账单"
    ],
    "englishForms": [
      "electricity bills"
    ],
    "en": "The electricity bill was higher this month.",
    "zh": "这个月的电费账单金额更高了。",
    "references": [
      "https://www.edfenergy.com/help-support/what-makes-up-your-bill"
    ]
  },
  {
    "term": "gas stove",
    "partOfSpeech": "noun phrase",
    "meaning": "① 燃气灶；煤气灶。利用燃气火焰加热锅具的炉灶，区别于电磁炉。",
    "chineseAliases": [
      "燃气灶",
      "煤气灶"
    ],
    "englishForms": [
      "gas stoves"
    ],
    "en": "The apartment has a small gas stove.",
    "zh": "这套公寓里有一个小燃气灶。",
    "references": [
      "https://www.ikea.com/us/en/cat/induction-cooktops-20813/"
    ]
  },
  {
    "term": "induction hob",
    "partOfSpeech": "noun phrase",
    "meaning": "① 电磁炉；电磁灶。通过电磁感应加热合适锅具的灶具，不是所有电炉都属于电磁炉。",
    "chineseAliases": [
      "电磁炉",
      "电磁灶"
    ],
    "englishForms": [
      "induction hobs"
    ],
    "en": "We bought a pan that works on our induction hob.",
    "zh": "我们买了一个适用于家里电磁炉的锅。",
    "references": [
      "https://www.ikea.com/us/en/cat/induction-cooktops-20813/"
    ]
  },
  {
    "term": "extractor hood",
    "partOfSpeech": "noun phrase",
    "meaning": "① 抽油烟机；厨房排烟罩。安装在灶台上方，用来抽走或过滤烹饪油烟、气味的装置。",
    "chineseAliases": [
      "抽油烟机",
      "油烟机",
      "厨房排烟罩"
    ],
    "englishForms": [
      "extractor hoods"
    ],
    "en": "I turned on the extractor hood before cooking.",
    "zh": "做饭前，我打开了抽油烟机。",
    "references": [
      "https://www.ikea.com/us/en/cat/range-hoods-filters-20819/"
    ]
  },
  {
    "term": "tumble dryer",
    "partOfSpeech": "noun phrase",
    "meaning": "① 滚筒式衣物烘干机。让衣物在滚筒中翻动并烘干的电器，不是除湿机。",
    "chineseAliases": [
      "滚筒烘干机",
      "滚筒式烘干机"
    ],
    "englishForms": [
      "tumble dryers"
    ],
    "en": "These towels can go in the tumble dryer.",
    "zh": "这些毛巾可以放进滚筒烘干机里。",
    "references": [
      "https://www.bosch-home.co.uk/en/category/laundry/tumble-dryers"
    ]
  },
  {
    "term": "electric kettle",
    "partOfSpeech": "noun phrase",
    "meaning": "① 电热水壶；电水壶。利用电能烧水的壶。",
    "chineseAliases": [
      "电热水壶",
      "电水壶"
    ],
    "englishForms": [
      "electric kettles"
    ],
    "en": "The electric kettle is on the kitchen counter.",
    "zh": "电热水壶放在厨房台面上。",
    "references": [
      "https://uk.russellhobbs.com/small-kitchen-appliances/kettles-toasters/kettles"
    ]
  },
  {
    "term": "screenshot",
    "partOfSpeech": "noun",
    "meaning": "① 截图；屏幕截图。把屏幕显示内容保存成的图像；take a screenshot 表示截屏、截图这个动作。",
    "chineseAliases": [
      "截屏",
      "截图",
      "屏幕截图"
    ],
    "englishForms": [
      "screenshots"
    ],
    "en": "Please send me a screenshot of the error message.",
    "zh": "请把报错信息的截图发给我。",
    "references": [
      "https://support.apple.com/en-sg/102616"
    ]
  },
  {
    "term": "no internet access",
    "partOfSpeech": "phrase",
    "meaning": "① 无法访问互联网；无法上网。描述不能使用互联网的状态，设备可能仍然连接着Wi-Fi。",
    "chineseAliases": [
      "断网",
      "无法上网",
      "无互联网访问"
    ],
    "englishForms": [],
    "en": "My laptop shows \"No internet access\" even though it is connected to Wi-Fi.",
    "zh": "我的笔记本电脑虽然连着Wi-Fi，却显示“无法访问互联网”。",
    "references": [
      "https://support.microsoft.com/en-us/windows/fix-wi-fi-connection-issues-in-windows-9424a1f7-6a3b-65a6-4d78-7f07eee84d2c"
    ]
  },
  {
    "term": "it depends",
    "partOfSpeech": "expression",
    "meaning": "① 看情况；视情况而定。回答还不能确定的事情，表示要由具体条件决定；可接 on，说明取决于什么。",
    "chineseAliases": [
      "看情况",
      "视情况而定",
      "得看情况"
    ],
    "englishForms": [],
    "en": "It depends on how much time we have after class.",
    "zh": "这得看我们下课后有多少时间。",
    "references": []
  },
  {
    "term": "to be honest",
    "partOfSpeech": "expression",
    "meaning": "① 说实话；坦白说。用于引出自己真实的想法或感受，不是形容一个人诚实。",
    "chineseAliases": [
      "说实话",
      "坦白说",
      "老实说"
    ],
    "englishForms": [],
    "en": "To be honest, I would rather cook at home tonight.",
    "zh": "说实话，我今晚更想在家做饭。",
    "references": []
  },
  {
    "term": "by the way",
    "partOfSpeech": "idiom",
    "meaning": "① 顺便说一句；对了。交谈时用来补充信息或转到另一个话题，不表示顺路去某个地方。",
    "chineseAliases": [
      "顺便说一句",
      "顺便说一下",
      "顺便问一下"
    ],
    "englishForms": [],
    "en": "By the way, the library closes earlier on Sundays.",
    "zh": "顺便说一句，图书馆星期日关门比较早。",
    "references": [
      "https://dictionary.cambridge.org/dictionary/english/by-the-way"
    ]
  },
  {
    "term": "it's your turn",
    "partOfSpeech": "expression",
    "meaning": "① 轮到你了。表示按顺序该由对方行动、发言或使用某样东西。",
    "chineseAliases": [
      "轮到你了",
      "该你了",
      "轮到你"
    ],
    "englishForms": [
      "it is your turn"
    ],
    "en": "It's your turn to choose a song for the journey.",
    "zh": "轮到你为路上挑一首歌了。",
    "references": []
  },
  {
    "term": "it's on me",
    "partOfSpeech": "expression",
    "meaning": "① 我请客；这次我付钱。用于主动承担这次餐费、饮料费等，不是指各自付款。",
    "chineseAliases": [
      "我请客",
      "这次我请",
      "这次我付钱"
    ],
    "englishForms": [
      "it is on me"
    ],
    "en": "Put your card away; it's on me this time.",
    "zh": "把卡收起来吧，这次我请客。",
    "references": [
      "https://w3fs.tainan.gov.tw/Download.ashx?n=RXZlcnlkYXkgRW5nbGlzaC0tMTAzLjEyKOW3suS%2FneWFqCkucGRm&u=LzAwMS9VcGxvYWQvMS9yZWxmaWxlLzk3NTcvMTg4ODkyLzMzMWUwMWJlLTIzYWMtNGUyYS1hYzJmLTJmMGU1ZjRjNWJmMS5wZGY%3D"
    ]
  },
  {
    "term": "I didn't catch that",
    "partOfSpeech": "expression",
    "meaning": "① 我没听清；刚才那句我没听到。表示没有听清对方刚才说的话，常用来请对方重复；不是说自己听力受损。",
    "chineseAliases": [
      "没听清",
      "我没听清",
      "刚才没听清"
    ],
    "englishForms": [
      "I did not catch that"
    ],
    "en": "I didn't catch that; could you repeat the room number?",
    "zh": "我没听清，你能再说一遍房间号吗？",
    "references": []
  },
  {
    "term": "keep in touch",
    "partOfSpeech": "verb phrase",
    "meaning": "① 保持联系。分开之后继续通过消息、电话等互通近况；与某人保持联系可说 keep in touch with someone。",
    "chineseAliases": [
      "保持联系",
      "继续联系",
      "互相保持联系"
    ],
    "englishForms": [
      "kept in touch",
      "keeping in touch",
      "keeps in touch"
    ],
    "en": "Let's keep in touch after the course finishes.",
    "zh": "课程结束后，我们继续保持联系吧。",
    "references": []
  },
  {
    "term": "be right back",
    "partOfSpeech": "expression",
    "meaning": "① 马上回来；很快就回来。离开一小会儿时告知别人自己很快会返回，常说 I'll be right back。",
    "chineseAliases": [
      "马上回来",
      "一会儿就回来",
      "很快回来"
    ],
    "englishForms": [],
    "en": "I'll be right back after I collect the parcel downstairs.",
    "zh": "我到楼下取一下包裹，马上就回来。",
    "references": []
  },
  {
    "term": "don't rush",
    "partOfSpeech": "expression",
    "meaning": "① 别着急做；别匆忙。提醒对方放慢行动或不要仓促作决定；不等同于安慰对方不用担心。",
    "chineseAliases": [
      "别着急",
      "别急着做",
      "不要匆忙"
    ],
    "englishForms": [
      "do not rush"
    ],
    "en": "Don't rush; we still have time to read the instructions.",
    "zh": "别着急，我们还有时间读说明。",
    "references": []
  },
  {
    "term": "speak more slowly",
    "partOfSpeech": "verb phrase",
    "meaning": "① 说慢一点；放慢语速。礼貌请求可以说 Could you speak more slowly?；这里指语速，不是降低音量。",
    "chineseAliases": [
      "说慢一点",
      "说慢点",
      "放慢语速"
    ],
    "englishForms": [],
    "en": "Could you speak more slowly while I write down the address?",
    "zh": "我记地址的时候，你能说慢一点吗？",
    "references": []
  },
  {
    "term": "if it's convenient",
    "partOfSpeech": "expression",
    "meaning": "① 如果方便的话。在提出请求或安排时间时，顾及对方是否方便；可接 for you。",
    "chineseAliases": [
      "方便的话",
      "如果方便的话",
      "如果你方便"
    ],
    "englishForms": [
      "if it is convenient"
    ],
    "en": "If it's convenient, we can meet near your office.",
    "zh": "如果方便的话，我们可以在你办公室附近见面。",
    "references": []
  },
  {
    "term": "give advance notice",
    "partOfSpeech": "verb phrase",
    "meaning": "① 提前通知；事先告知。让对方在事情发生前获得消息，以便安排；notice 在这里是通知，不是注意到。",
    "chineseAliases": [
      "提前通知",
      "事先通知",
      "提前告知"
    ],
    "englishForms": [
      "gave advance notice",
      "given advance notice",
      "giving advance notice",
      "gives advance notice"
    ],
    "en": "Please give advance notice if you need to change the delivery date.",
    "zh": "如果需要改送货日期，请提前通知。",
    "references": []
  },
  {
    "term": "public toilet",
    "partOfSpeech": "noun phrase",
    "meaning": "① 公共厕所；公厕。供公众使用的厕所，英式英语中的常见说法；美式公共场所常用 restroom。",
    "chineseAliases": [
      "公共厕所",
      "公厕"
    ],
    "englishForms": [
      "public toilets"
    ],
    "en": "There is a public toilet beside the park entrance.",
    "zh": "公园入口旁边有一个公共厕所。",
    "references": []
  },
  {
    "term": "water dispenser",
    "partOfSpeech": "noun phrase",
    "meaning": "① 饮水机。供应饮用水的设备，可按设备功能提供常温水、冷水或热水；不等同于专指喷嘴式直饮水台的 drinking fountain。",
    "chineseAliases": [
      "饮水机",
      "桶装水饮水机"
    ],
    "englishForms": [
      "water dispensers"
    ],
    "en": "The water dispenser is next to the shared kitchen.",
    "zh": "饮水机就在公共厨房旁边。",
    "references": []
  },
  {
    "term": "accessible toilet",
    "partOfSpeech": "noun phrase",
    "meaning": "① 无障碍厕所；无障碍卫生间。为有行动等使用需求的人提供便利设施的厕所；不是无性别厕所的同义词。",
    "chineseAliases": [
      "无障碍厕所",
      "无障碍卫生间",
      "无障碍洗手间"
    ],
    "englishForms": [
      "accessible toilets"
    ],
    "en": "The accessible toilet is on the ground floor near the lift.",
    "zh": "无障碍卫生间在底层，靠近电梯。",
    "references": []
  },
  {
    "term": "food allergy",
    "partOfSpeech": "noun phrase",
    "meaning": "① 食物过敏。免疫系统对某种食物产生的过敏反应；不等同于食物不耐受或单纯不喜欢某种食物。",
    "chineseAliases": [
      "食物过敏",
      "食品过敏"
    ],
    "englishForms": [
      "food allergies"
    ],
    "en": "I mentioned my food allergy when I booked the table.",
    "zh": "我订餐位时告知了自己的食物过敏情况。",
    "references": [
      "https://www.nhs.uk/conditions/allergies/"
    ]
  },
  {
    "term": "lip balm",
    "partOfSpeech": "noun phrase",
    "meaning": "① 润唇膏。用于滋润嘴唇的膏状等产品；不等同于主要用于增加光泽的 lip gloss，也不是所有口红的统称。",
    "chineseAliases": [
      "润唇膏"
    ],
    "englishForms": [
      "lip balms"
    ],
    "en": "I keep a small tube of lip balm in the front pocket of my bag.",
    "zh": "我在包的前袋里放了一小支润唇膏。",
    "references": [
      "https://dictionary.cambridge.org/us/dictionary/english/lip-balm?topic=make-up-and-skin-care"
    ]
  },
  {
    "term": "contact lens",
    "partOfSpeech": "noun phrase",
    "meaning": "① 隐形眼镜；接触镜。戴在眼球表面的镜片；日常谈一副或多片时通常用复数 contact lenses，不专指彩色美瞳。",
    "chineseAliases": [
      "隐形眼镜",
      "接触镜"
    ],
    "englishForms": [
      "contact lenses"
    ],
    "en": "She ordered a new pair of contact lenses from her optician.",
    "zh": "她从验光配镜师那里订购了一副新的隐形眼镜。",
    "references": []
  },
  {
    "term": "over-the-counter medicine",
    "partOfSpeech": "noun phrase",
    "meaning": "① 非处方药。无需医生处方便可购买的药品，常缩写为 OTC medicine；是否属于非处方药取决于当地规定，不表示可以任意使用。",
    "chineseAliases": [
      "非处方药",
      "非处方药品"
    ],
    "englishForms": [
      "over-the-counter medicines"
    ],
    "en": "The pharmacist showed me where the over-the-counter medicines were displayed.",
    "zh": "药剂师给我指了非处方药的陈列位置。",
    "references": [
      "https://www.fda.gov/drugs/buying-using-medicine-safely/understanding-over-counter-medicines"
    ]
  },
  {
    "term": "lost and found",
    "partOfSpeech": "noun phrase",
    "meaning": "① 失物招领处；失物招领。存放拾获物并协助失主认领的地方或服务，美式英语常用；不是指所有已经丢失的物品。",
    "chineseAliases": [
      "失物招领处",
      "失物招领",
      "失物认领处"
    ],
    "englishForms": [],
    "en": "I asked at the lost and found about my missing umbrella.",
    "zh": "我到失物招领处询问有没有人捡到我的雨伞。",
    "references": []
  },
  {
    "term": "pick up an order",
    "partOfSpeech": "verb phrase",
    "meaning": "① 自取订单；到店自取。到商家或指定地点领取自己订购的商品或餐食，强调领取动作，不是送货上门。",
    "chineseAliases": [
      "自取",
      "到店自取",
      "领取订单商品"
    ],
    "englishForms": [
      "picks up an order",
      "picking up an order",
      "picked up an order"
    ],
    "en": "I will pick up an order from the cafe on my way home.",
    "zh": "我会在回家路上到咖啡店领取订好的餐食。",
    "references": []
  },
  {
    "term": "wireless network",
    "partOfSpeech": "noun phrase",
    "meaning": "① 无线网络。设备通过无线信号而非有线连接进行通信的网络；Wi-Fi是常见的一类，无线网络这个范围不只包括Wi-Fi。",
    "chineseAliases": [
      "无线网络",
      "无线网"
    ],
    "englishForms": [
      "wireless networks"
    ],
    "en": "The tablet connects to the school wireless network.",
    "zh": "这台平板电脑连接学校的无线网络。",
    "references": []
  },
  {
    "term": "clothes dryer",
    "partOfSpeech": "noun phrase",
    "meaning": "① 衣物烘干机；干衣机。用于烘干衣物的设备，既可指滚筒式，也可指其他设计，不等同于除湿机。",
    "chineseAliases": [
      "衣物烘干机",
      "干衣机"
    ],
    "englishForms": [
      "clothes dryers"
    ],
    "en": "The shared laundry room has two clothes dryers.",
    "zh": "公共洗衣房里有两台衣物烘干机。",
    "references": []
  },
  {
    "term": "place an order",
    "partOfSpeech": "verb phrase",
    "meaning": "① 下单；订购商品或服务。② 点餐；点单。在餐馆或外卖场景中，表示提出要购买哪些食物或饮料，不是付款结账。",
    "chineseAliases": [
      "下单",
      "点单",
      "点餐",
      "提交订单"
    ],
    "englishForms": [
      "places an order",
      "placing an order",
      "placed an order"
    ],
    "en": "We were ready to place an order after reading the menu.",
    "zh": "看完菜单后，我们准备点餐了。",
    "references": [
      "https://dictionary.cambridge.org/gu/dictionary/english-gujarati/order"
    ]
  },
  {
    "term": "pay the bill",
    "partOfSpeech": "verb phrase",
    "meaning": "① 付账；结账；买单。支付应付的账款，在餐馆里常指付餐费；与点餐或下单不同。",
    "chineseAliases": [
      "结账",
      "结帐",
      "买单",
      "付账",
      "餐厅结账"
    ],
    "englishForms": [
      "pays the bill",
      "paying the bill",
      "paid the bill"
    ],
    "en": "We paid the bill and left the restaurant together.",
    "zh": "我们结完账，一起离开了餐馆。",
    "references": [
      "https://dictionary.cambridge.org/dictionary/learner-english/pay"
    ]
  },
  {
    "term": "check out",
    "partOfSpeech": "phrasal verb",
    "meaning": "① 结账；在商店或网店完成购买、支付商品费用。② 办理退房，结束酒店住宿。具体意思取决于购物或住宿语境。",
    "chineseAliases": [
      "结账",
      "结帐",
      "购物结账",
      "超市结账",
      "网购结账"
    ],
    "englishForms": [
      "checks out",
      "checking out",
      "checked out"
    ],
    "en": "I checked out after adding all the groceries to my basket.",
    "zh": "把需要的食品杂货都放进购物篮后，我结了账。",
    "references": [
      "https://dictionary.cambridge.org/us/dictionary/english/check-out"
    ]
  },
  {
    "term": "report a card as lost",
    "partOfSpeech": "verb phrase",
    "meaning": "① 为卡片挂失；报告卡片遗失。在银行场景中可指银行卡挂失，明确通知发卡方卡片丢失；不是补办新卡的同义表达。",
    "chineseAliases": [
      "银行卡挂失",
      "挂失银行卡",
      "银行卡报失",
      "卡片挂失"
    ],
    "englishForms": [
      "reports a card as lost",
      "reporting a card as lost",
      "reported a card as lost"
    ],
    "en": "I called the bank to report my card as lost.",
    "zh": "我给银行打了电话，为遗失的银行卡挂失。",
    "references": [
      "https://www.hsbc.co.uk/help/card-support/lost-or-stolen/"
    ]
  },
  {
    "term": "report something as lost",
    "partOfSpeech": "verb phrase",
    "meaning": "① 报失；报告某物遗失；挂失。向相关机构明确报告证件、卡片或其他物品遗失；具体对象及后续处理须结合情境，不限定为银行卡。",
    "chineseAliases": [
      "挂失",
      "报失",
      "报告遗失"
    ],
    "englishForms": [
      "reports something as lost",
      "reporting something as lost",
      "reported something as lost"
    ],
    "en": "I need to report my library card as lost before applying for a replacement.",
    "zh": "申请补办之前，我需要先把借书证挂失。",
    "references": [
      "https://dictionary.cambridge.org/us/dictionary/english/report"
    ]
  },
  {
    "term": "security deposit",
    "partOfSpeech": "noun phrase",
    "meaning": "① 租房押金；租赁保证金。租赁开始时为履约、损坏等事项提供担保的一笔钱，不等于房租本身；能否扣除或退还取决于适用约定与规定。",
    "chineseAliases": [
      "租房押金",
      "租赁押金",
      "租赁保证金"
    ],
    "englishForms": [
      "security deposits"
    ],
    "en": "The agreement lists the rent and the security deposit separately.",
    "zh": "协议把租金和租房押金分别列了出来。",
    "references": [
      "https://dictionary.cambridge.org/us/dictionary/english/security-deposit"
    ]
  },
  {
    "term": "change a booking",
    "partOfSpeech": "verb phrase",
    "meaning": "① 更改预订；在机票等出行场景中可表示改签。修改原有行程或预订安排，不是旅途中换乘另一架飞机。",
    "chineseAliases": [
      "改签",
      "更改预订",
      "修改预订",
      "机票改签"
    ],
    "englishForms": [
      "changes a booking",
      "changed a booking",
      "changing a booking"
    ],
    "en": "I need to change a booking because my travel dates have changed.",
    "zh": "我的出行日期变了，需要更改预订。",
    "references": [
      "https://www.britishairways.com/content/information/help/faqs/manage-booking"
    ]
  },
  {
    "term": "top up an account",
    "partOfSpeech": "verb phrase",
    "meaning": "① 给账户充值；向预付账户增加余额。可用于手机话费、交通卡等账户，不是给电池充电。",
    "chineseAliases": [
      "充值",
      "账户充值",
      "给账户充值",
      "话费充值",
      "充话费"
    ],
    "englishForms": [
      "tops up an account",
      "topped up an account",
      "topping up an account"
    ],
    "en": "You can top up an account online before the balance runs out.",
    "zh": "你可以在余额用完之前在线给账户充值。",
    "references": [
      "https://freesim.vodafone.co.uk/topup/",
      "https://www.vodafone.co.uk/about-this-site/terms-and-conditions/pay-as-you-go-airtime-conditions/VFCON063312"
    ]
  },
  {
    "term": "phone credit",
    "partOfSpeech": "noun phrase",
    "meaning": "① 手机话费余额；预付电话账户中可使用的金额。这里的 credit 是账户额度，不是手机剩余电量，也不一定指当月账单。",
    "chineseAliases": [
      "手机话费余额",
      "话费余额",
      "手机余额",
      "预付话费余额"
    ],
    "englishForms": [],
    "en": "I checked my phone credit before making the call.",
    "zh": "打电话之前，我查看了手机话费余额。",
    "references": [
      "https://www.vodafone.co.uk/about-this-site/terms-and-conditions/pay-as-you-go-airtime-conditions/VFCON063312"
    ]
  },
  {
    "term": "parking fee",
    "partOfSpeech": "noun phrase",
    "meaning": "① 停车费。为停放车辆而支付的费用，不是违反停车规定而收到的罚款。",
    "chineseAliases": [
      "停车费",
      "停车费用",
      "泊车费"
    ],
    "englishForms": [
      "parking fees"
    ],
    "en": "The parking fee is included in the hotel bill.",
    "zh": "停车费包含在酒店账单里。",
    "references": [
      "https://beg.aero/sites/default/files/2025-12/parking-p7-price-list.pdf"
    ]
  },
  {
    "term": "charge a battery",
    "partOfSpeech": "verb phrase",
    "meaning": "① 给电池充电。向可充电电池补充电能，不是向话费或其他账户充值。",
    "chineseAliases": [
      "电池充电",
      "给电池充电"
    ],
    "englishForms": [
      "charges a battery",
      "charged a battery",
      "charging a battery"
    ],
    "en": "I need to charge a battery for the camera before we leave.",
    "zh": "出发前，我需要给相机的一块电池充电。",
    "references": [
      "https://support.apple.com/en-ca/guide/iphone/iph63eecc618/ios"
    ]
  },
  {
    "term": "pantyliner",
    "partOfSpeech": "noun",
    "meaning": "① 卫生护垫；内裤护垫。贴在内裤上的薄型吸收性卫生用品，通常比经期卫生巾更薄小。",
    "chineseAliases": [
      "护垫",
      "卫生护垫",
      "内裤护垫"
    ],
    "englishForms": [
      "pantyliners",
      "panty liner",
      "panty liners"
    ],
    "en": "The shop keeps pantyliners beside the sanitary pads.",
    "zh": "这家店把护垫摆在卫生巾旁边。",
    "references": [
      "https://dictionary.cambridge.org/dictionary/english/panty-liner",
      "https://www.always.co.uk/en-gb/feminine-products/panty-liners/"
    ]
  },
  {
    "term": "mouthwash",
    "partOfSpeech": "noun",
    "meaning": "① 漱口水；漱口液。用来在口腔中含漱的液体清洁或护理产品。",
    "chineseAliases": [
      "漱口水",
      "漱口液"
    ],
    "englishForms": [],
    "en": "I put a small bottle of mouthwash in my travel bag.",
    "zh": "我在旅行包里放了一小瓶漱口水。",
    "references": [
      "https://www.listerine.com/products/mouthwash"
    ]
  },
  {
    "term": "facial cleanser",
    "partOfSpeech": "noun phrase",
    "meaning": "① 洁面产品；洗面奶。用于清洁面部皮肤的产品的通称，可有乳状、凝胶、泡沫等不同质地。",
    "chineseAliases": [
      "洗面奶",
      "洁面乳",
      "洁面产品",
      "面部洁面产品"
    ],
    "englishForms": [
      "facial cleansers"
    ],
    "en": "The facial cleanser is on the shelf above the sink.",
    "zh": "洗面奶放在洗手池上方的架子上。",
    "references": [
      "https://www.cerave.com/skincare/cleansers/facial-cleansers"
    ]
  },
  {
    "term": "key ring",
    "partOfSpeech": "noun phrase",
    "meaning": "① 钥匙环；钥匙扣。把几把钥匙串在一起、方便携带的小环，也可连有装饰物。",
    "chineseAliases": [
      "钥匙扣",
      "钥匙环"
    ],
    "englishForms": [
      "key rings",
      "keyring",
      "keyrings"
    ],
    "en": "I attached my new key to the key ring.",
    "zh": "我把新钥匙挂到了钥匙环上。",
    "references": [
      "https://dictionary.cambridge.org/dictionary/english/key-ring"
    ]
  },
  {
    "term": "sticky note",
    "partOfSpeech": "noun phrase",
    "meaning": "① 便利贴；便签贴。背面一部分带有黏性、可贴在纸张或物品上作提醒的小纸片。",
    "chineseAliases": [
      "便利贴",
      "便签贴",
      "自粘便签"
    ],
    "englishForms": [
      "sticky notes"
    ],
    "en": "I left a sticky note on the fridge to remind myself to buy milk.",
    "zh": "我在冰箱上贴了一张便利贴，提醒自己买牛奶。",
    "references": [
      "https://www.post-it.com/3M/en_US/p/pc/super-sticky-notes/"
    ]
  },
  {
    "term": "storage box",
    "partOfSpeech": "noun phrase",
    "meaning": "① 收纳盒；储物箱。用来整理和存放物品的盒子或箱子，不一定适合接触或存放食物。",
    "chineseAliases": [
      "收纳盒",
      "收纳箱",
      "储物箱",
      "储物盒"
    ],
    "englishForms": [
      "storage boxes"
    ],
    "en": "I keep spare cables in a storage box under my desk.",
    "zh": "我把备用线缆放在书桌下面的收纳盒里。",
    "references": [
      "https://www.ikea.com/gb/en/cat/storage-boxes-10797/"
    ]
  },
  {
    "term": "air conditioner remote control",
    "partOfSpeech": "noun phrase",
    "meaning": "① 空调遥控器。用于远程调整空调开关、温度、模式等设置的控制装置。",
    "chineseAliases": [
      "空调遥控器",
      "空调遥控板"
    ],
    "englishForms": [
      "air conditioner remote controls"
    ],
    "en": "Where did you put the air conditioner remote control?",
    "zh": "你把空调遥控器放在哪里了？",
    "references": [
      "https://www.daikin.com.sg/blog/understanding-your-air-conditioners-remote-control/"
    ]
  },
  {
    "term": "access card",
    "partOfSpeech": "noun phrase",
    "meaning": "① 门禁卡；出入卡。经授权后，用来进入楼宇、房间或受控区域的卡片。",
    "chineseAliases": [
      "门禁卡",
      "门卡",
      "出入卡"
    ],
    "englishForms": [
      "access cards"
    ],
    "en": "I need my access card to enter the office after six.",
    "zh": "六点以后，我需要用门禁卡才能进入办公室。",
    "references": [
      "https://docs.hidglobal.com/hid-visitor-manager/content/guides/event_check_in_and_check_out.htm",
      "https://www.hidglobal.com/products/crescendo"
    ]
  },
    {
      "term": "plunger",
      "partOfSpeech": "noun",
      "meaning": "① 皮搋子；管道疏通吸盘。带手柄和橡胶吸盘、用来疏通堵塞管道的工具。",
      "chineseAliases": [
        "皮搋子",
        "马桶吸",
        "马桶吸盘",
        "管道疏通吸盘"
      ],
      "englishForms": [
        "plungers"
      ],
      "en": "There is a plunger beside the downstairs toilet.",
      "zh": "楼下的马桶旁边放着一个皮搋子。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/plunger"
      ]
    },
    {
      "term": "blocked drain",
      "partOfSpeech": "noun phrase",
      "meaning": "① 堵塞的下水道；堵住的排水管。指排水通路被异物等阻塞。",
      "chineseAliases": [
        "下水道堵塞",
        "堵塞的下水道",
        "排水管堵塞"
      ],
      "englishForms": [
        "blocked drains"
      ],
      "en": "A blocked drain was causing water to collect in the shower.",
      "zh": "排水管堵塞，导致淋浴间里积水。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/unblock"
      ]
    },
    {
      "term": "unblock a drain",
      "partOfSpeech": "verb phrase",
      "meaning": "① 疏通下水道；清除排水管里的堵塞物，使其恢复排水。",
      "chineseAliases": [
        "疏通下水道",
        "疏通排水管"
      ],
      "englishForms": [
        "unblocks a drain",
        "unblocked a drain",
        "unblocking a drain",
        "unblock drains"
      ],
      "en": "The plumber came to unblock a drain beneath the sink.",
      "zh": "水管工来疏通水槽下面的一根排水管。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/unblock"
      ]
    },
    {
      "term": "stepladder",
      "partOfSpeech": "noun",
      "meaning": "① 人字梯；可自行站立的折叠梯，展开后不用倚靠墙面。",
      "chineseAliases": [
        "人字梯",
        "折叠人字梯"
      ],
      "englishForms": [
        "stepladders"
      ],
      "en": "The folded stepladder fits behind the kitchen door.",
      "zh": "折好的人字梯可以放在厨房门后。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/stepladder"
      ]
    },
    {
      "term": "crosshead screwdriver",
      "partOfSpeech": "noun phrase",
      "meaning": "① 十字螺丝刀；刀头用于转动十字槽螺钉的螺丝刀。",
      "chineseAliases": [
        "十字螺丝刀",
        "十字起子",
        "十字螺丝起子"
      ],
      "englishForms": [
        "crosshead screwdrivers",
        "cross-head screwdriver",
        "cross-head screwdrivers"
      ],
      "en": "I put the crosshead screwdriver back in the toolbox.",
      "zh": "我把十字螺丝刀放回了工具箱。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/crosshead-screwdriver"
      ]
    },
    {
      "term": "flathead screwdriver",
      "partOfSpeech": "noun phrase",
      "meaning": "① 一字螺丝刀；刀头呈扁平一字形、用于转动一字槽螺钉的螺丝刀。",
      "chineseAliases": [
        "一字螺丝刀",
        "一字起子",
        "平口螺丝刀"
      ],
      "englishForms": [
        "flathead screwdrivers",
        "flat-head screwdriver",
        "flat-head screwdrivers"
      ],
      "en": "The flathead screwdriver has a blue handle.",
      "zh": "那把一字螺丝刀有一个蓝色手柄。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/flathead-screwdriver"
      ]
    },
    {
      "term": "Allen key",
      "partOfSpeech": "noun phrase",
      "meaning": "① 内六角扳手。用于转动头部带内六角凹槽的螺钉，常呈 L 形；Allen 原为商标名称。",
      "chineseAliases": [
        "内六角扳手",
        "艾伦扳手"
      ],
      "englishForms": [
        "Allen keys"
      ],
      "en": "The desk came with a small Allen key.",
      "zh": "这张书桌附带了一把小内六角扳手。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/allen-key"
      ]
    },
    {
      "term": "cable tie",
      "partOfSpeech": "noun phrase",
      "meaning": "① 扎带；束线带。可收紧并扣住的细长带子，常用来捆扎电线等物品。",
      "chineseAliases": [
        "扎带",
        "束线带",
        "塑料扎带",
        "尼龙扎带"
      ],
      "englishForms": [
        "cable ties"
      ],
      "en": "A cable tie keeps these loose wires together.",
      "zh": "一根扎带把这些散乱的电线束在一起。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/cable-tie"
      ]
    },
    {
      "term": "double-sided tape",
      "partOfSpeech": "noun phrase",
      "meaning": "① 双面胶；双面胶带。两面都有黏胶、可夹在物体之间进行粘合的胶带。",
      "chineseAliases": [
        "双面胶",
        "双面胶带"
      ],
      "englishForms": [],
      "en": "She attached the photo to the card with double-sided tape.",
      "zh": "她用双面胶把照片粘在卡片上。",
      "references": [
        "https://www.3m.com/3M/en_US/p/d/b5005644009/"
      ]
    },
    {
      "term": "electrical tape",
      "partOfSpeech": "noun phrase",
      "meaning": "① 电工胶带；绝缘胶带。用于电气绝缘、包扎等用途的专用胶带。",
      "chineseAliases": [
        "绝缘胶带",
        "电工胶带",
        "电气绝缘胶带"
      ],
      "englishForms": [],
      "en": "The electrician took a roll of electrical tape from his bag.",
      "zh": "电工从包里拿出了一卷绝缘胶带。",
      "references": [
        "https://www.3m.com/3M/en_US/electrical-construction-maintenance-us/products/electrical-tapes/"
      ]
    },
    {
      "term": "fitted sheet",
      "partOfSpeech": "noun phrase",
      "meaning": "① 床笠；带松紧边、可包住并固定在床垫上的床单。",
      "chineseAliases": [
        "床笠",
        "松紧床笠"
      ],
      "englishForms": [
        "fitted sheets"
      ],
      "en": "This fitted sheet is too small for our new mattress.",
      "zh": "这张床笠对我们的新床垫来说太小了。",
      "references": [
        "https://www.ikea.com/us/en/p/dvala-fitted-sheet-white-60356573/"
      ]
    },
    {
      "term": "pillow insert",
      "partOfSpeech": "noun phrase",
      "meaning": "① 枕芯；靠垫芯。放在枕套或靠垫套里面、有填充物的内芯，区别于外面的套子。",
      "chineseAliases": [
        "枕芯",
        "靠枕芯",
        "靠垫芯",
        "抱枕芯"
      ],
      "englishForms": [
        "pillow inserts"
      ],
      "en": "The pillow insert fits neatly inside the new cover.",
      "zh": "这个枕芯正好装进新枕套里。",
      "references": [
        "https://www.thecompanystore.com/pillow-inserts",
        "https://www.ikea.com/us/en/cat/pillow-inserts-18904/"
      ]
    },
    {
      "term": "duvet",
      "partOfSpeech": "noun",
      "meaning": "① 被芯；蓬松的被子。内部填有羽绒、羽毛或合成材料等，通常另套被套使用；不是被套本身。",
      "chineseAliases": [
        "被芯",
        "羽绒被芯"
      ],
      "englishForms": [
        "duvets"
      ],
      "en": "I put the clean cover back on the duvet.",
      "zh": "我把干净的被套重新套在被芯上。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/duvet"
      ]
    },
    {
      "term": "toilet roll",
      "partOfSpeech": "noun phrase",
      "meaning": "① 卷筒卫生纸；卫生纸卷。绕成卷、供如厕后清洁使用的柔软纸张。",
      "chineseAliases": [
        "卷筒卫生纸",
        "卫生纸卷",
        "卷纸卫生纸"
      ],
      "englishForms": [
        "toilet rolls"
      ],
      "en": "We keep the spare toilet rolls in a basket by the door.",
      "zh": "备用的卫生纸卷放在门旁的篮子里。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/toilet-roll?topic=toiletry-and-perfumes"
      ]
    },
    {
      "term": "fabric shaver",
      "partOfSpeech": "noun phrase",
      "meaning": "① 去毛球器；毛球修剪器。用于去除衣物等织物表面毛球的小型工具或电器。",
      "chineseAliases": [
        "去毛球器",
        "毛球修剪器",
        "衣物去球器"
      ],
      "englishForms": [
        "fabric shavers"
      ],
      "en": "The fabric shaver removed the little pills from my sweater.",
      "zh": "去毛球器去掉了我毛衣上的小毛球。",
      "references": [
        "https://www.domesticappliances.philips.co.in/collections/ironing/fabric-shaver"
      ]
    },
    {
      "term": "lint roller",
      "partOfSpeech": "noun phrase",
      "meaning": "① 粘毛滚筒；粘毛器。带黏性表面的滚筒，用来粘走衣物等表面的毛发和浮毛。",
      "chineseAliases": [
        "粘毛滚筒",
        "黏毛滚筒",
        "粘毛滚",
        "粘毛器"
      ],
      "englishForms": [
        "lint rollers"
      ],
      "en": "I used a lint roller to remove cat hair from my coat.",
      "zh": "我用粘毛滚筒粘掉了大衣上的猫毛。",
      "references": [
        "https://www.ikea.com/se/en/p/baestis-lint-roller-grey-90425626/"
      ]
    },
    {
      "term": "garment steamer",
      "partOfSpeech": "noun phrase",
      "meaning": "① 挂烫机；衣物蒸汽熨烫机。用蒸汽帮助去除衣物褶皱的器具，可用于悬挂的衣物。",
      "chineseAliases": [
        "挂烫机",
        "衣物挂烫机",
        "蒸汽挂烫机"
      ],
      "englishForms": [
        "garment steamers"
      ],
      "en": "The garment steamer has a removable water tank.",
      "zh": "这台挂烫机有一个可拆卸水箱。",
      "references": [
        "https://www.home-appliances.philips/gb/en/p/STE1040_20"
      ]
    },
    {
      "term": "flip-flop",
      "partOfSpeech": "noun",
      "meaning": "① 人字拖；夹脚拖鞋。鞋带呈 V 形、从大脚趾与旁边脚趾之间穿过的露趾便鞋，通常用复数 flip-flops。",
      "chineseAliases": [
        "人字拖",
        "人字拖鞋",
        "夹脚拖鞋"
      ],
      "englishForms": [
        "flip-flops"
      ],
      "en": "He left his flip-flops outside the bathroom.",
      "zh": "他把人字拖留在了浴室外面。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/flip-flop"
      ]
    },
    {
      "term": "shampoo",
      "partOfSpeech": "noun",
      "meaning": "① 洗发水；洗发液。用来清洗头发的液体清洁用品。",
      "chineseAliases": [
        "洗发水",
        "洗发液",
        "洗头水"
      ],
      "englishForms": [
        "shampoos"
      ],
      "en": "The shampoo bottle is almost empty.",
      "zh": "那瓶洗发水快用完了。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/shampoo?topic=cleaning-and-tidying-places-and-things"
      ]
    },
    {
      "term": "hair conditioner",
      "partOfSpeech": "noun phrase",
      "meaning": "① 护发素；护发剂。用于改善头发柔顺度和外观的护发用品，区别于清洁头发的洗发水。",
      "chineseAliases": [
        "护发素",
        "护发剂",
        "头发护发素"
      ],
      "englishForms": [
        "hair conditioners"
      ],
      "en": "My hair is easier to comb after I use hair conditioner.",
      "zh": "用了护发素之后，我的头发更容易梳理。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english-chinese-simplified/conditioner"
      ]
    },
    {
      "term": "shower gel",
      "partOfSpeech": "noun phrase",
      "meaning": "① 沐浴露；沐浴啫喱。淋浴时用于清洁身体的液体或凝胶状清洁用品。",
      "chineseAliases": [
        "沐浴露",
        "沐浴啫喱",
        "淋浴凝胶"
      ],
      "englishForms": [
        "shower gels"
      ],
      "en": "The shower gel has a light citrus scent.",
      "zh": "这款沐浴露有淡淡的柑橘香味。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/shower-gel?topic=cleaning-agents"
      ]
    },
    {
      "term": "nail clippers",
      "partOfSpeech": "plural noun",
      "meaning": "① 指甲剪；指甲钳。用于修剪指甲的小工具，常说 a pair of nail clippers。",
      "chineseAliases": [
        "指甲剪",
        "指甲钳"
      ],
      "englishForms": [],
      "en": "I keep a pair of nail clippers in the bathroom drawer.",
      "zh": "我在浴室抽屉里放着一把指甲剪。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/clipper"
      ]
    },
    {
      "term": "shaving foam",
      "partOfSpeech": "noun phrase",
      "meaning": "① 剃须泡沫。剃须时使用的泡沫状用品，区别于剃须刀本身。",
      "chineseAliases": [
        "剃须泡沫",
        "刮胡泡沫",
        "刮胡子泡沫"
      ],
      "englishForms": [],
      "en": "There is a can of shaving foam next to the razor.",
      "zh": "剃须刀旁边有一罐剃须泡沫。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/learner-english/foam",
        "https://dictionary.cambridge.org/dictionary/english/shaving"
      ]
    },
    {
      "term": "electric shaver",
      "partOfSpeech": "noun phrase",
      "meaning": "① 电动剃须刀；电须刀。由电力驱动、用于剃除胡须的器具。",
      "chineseAliases": [
        "电动剃须刀",
        "电须刀",
        "电动刮胡刀"
      ],
      "englishForms": [
        "electric shavers"
      ],
      "en": "My electric shaver needs charging before I can use it.",
      "zh": "我的电动剃须刀需要先充电才能使用。",
      "references": [
        "https://www.usa.philips.com/c-p/PQ208_17/electric-shaver"
      ]
    },
    {
      "term": "set-top box",
      "partOfSpeech": "noun phrase",
      "meaning": "① 电视机顶盒；机顶盒。连接电视、用于接收和处理数字电视等节目信号的设备。",
      "chineseAliases": [
        "电视机顶盒",
        "机顶盒",
        "数字电视机顶盒"
      ],
      "englishForms": [
        "set-top boxes"
      ],
      "en": "The remote control for the set-top box is on the sofa.",
      "zh": "电视机顶盒的遥控器在沙发上。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/set-top-box?topic=television"
      ]
    },
    {
      "term": "Ethernet port",
      "partOfSpeech": "noun phrase",
      "meaning": "① 以太网接口；网口。用于连接以太网网线的接口。",
      "chineseAliases": [
        "网口",
        "以太网接口",
        "以太网端口",
        "网线接口"
      ],
      "englishForms": [
        "Ethernet ports"
      ],
      "en": "This laptop has no Ethernet port, so I use an adapter.",
      "zh": "这台笔记本没有网口，所以我使用转接器。",
      "references": [
        "https://support.apple.com/en-al/guide/mac-help/mchlp1413/mac"
      ]
    },
    {
      "term": "wireless network adapter",
      "partOfSpeech": "noun phrase",
      "meaning": "① 无线网卡；无线网络适配器。让设备连接无线网络的硬件，可内置或外接。",
      "chineseAliases": [
        "无线网卡",
        "无线网络适配器",
        "无线网络卡"
      ],
      "englishForms": [
        "wireless network adapters"
      ],
      "en": "The computer has a built-in wireless network adapter.",
      "zh": "这台电脑内置了无线网卡。",
      "references": [
        "https://support.microsoft.com/en-us/windows/experience/connectivity-networking/setting-up-a-wireless-network-in-windows"
      ]
    },
    {
      "term": "pair a Bluetooth device",
      "partOfSpeech": "verb phrase",
      "meaning": "① 与蓝牙设备配对；建立蓝牙设备之间的配对关系。配对不等于设备会始终保持连接。",
      "chineseAliases": [
        "蓝牙配对",
        "与蓝牙设备配对",
        "配对蓝牙设备"
      ],
      "englishForms": [
        "pairs a Bluetooth device",
        "paired a Bluetooth device",
        "pairing a Bluetooth device",
        "pair Bluetooth devices"
      ],
      "en": "I need to pair a Bluetooth device with this tablet.",
      "zh": "我需要把一台蓝牙设备与这台平板电脑配对。",
      "references": [
        "https://support.apple.com/en-gb/105108"
      ]
    },
    {
      "term": "unpair a Bluetooth device",
      "partOfSpeech": "verb phrase",
      "meaning": "① 取消蓝牙设备的配对；移除已经建立的蓝牙配对关系，区别于暂时断开连接。",
      "chineseAliases": [
        "取消蓝牙配对",
        "取消蓝牙设备配对",
        "解除蓝牙配对",
        "取消配对蓝牙设备"
      ],
      "englishForms": [
        "unpairs a Bluetooth device",
        "unpaired a Bluetooth device",
        "unpairing a Bluetooth device",
        "unpair Bluetooth devices"
      ],
      "en": "I unpaired a Bluetooth device that I no longer use.",
      "zh": "我取消了一台已不用的蓝牙设备的配对。",
      "references": [
        "https://support.apple.com/en-gb/105108"
      ]
    },
    {
      "term": "screen sharing",
      "partOfSpeech": "noun phrase",
      "meaning": "① 屏幕共享。通过通话或协作软件等，让其他人看到自己的屏幕或选定窗口。",
      "chineseAliases": [
        "屏幕共享",
        "共享屏幕"
      ],
      "englishForms": [],
      "en": "Screen sharing helped us find the error together.",
      "zh": "屏幕共享帮助我们一起找到了错误。",
      "references": [
        "https://support.microsoft.com/en-us/teams/chat/share-your-screen-in-a-chat-in-microsoft-teams"
      ]
    },
    {
      "term": "screen mirroring",
      "partOfSpeech": "noun phrase",
      "meaning": "① 屏幕镜像；镜像投屏。把本机屏幕的画面实时显示在另一块屏幕上；这里特指镜像屏幕，不是仅投放某个视频。",
      "chineseAliases": [
        "投屏",
        "屏幕镜像",
        "镜像投屏",
        "手机屏幕镜像"
      ],
      "englishForms": [],
      "en": "Screen mirroring lets the family see my phone photos on the TV.",
      "zh": "通过屏幕镜像，全家人可以在电视上看我手机里的照片。",
      "references": [
        "https://support.apple.com/en-gb/102661?ct=t"
      ]
    },
    {
      "term": "restore from a backup",
      "partOfSpeech": "verb phrase",
      "meaning": "① 从备份恢复；使用先前保存的备份还原数据或设备内容。",
      "chineseAliases": [
        "恢复备份",
        "从备份恢复",
        "从备份还原"
      ],
      "englishForms": [
        "restores from a backup",
        "restored from a backup",
        "restoring from a backup"
      ],
      "en": "We restored from a backup after replacing the damaged drive.",
      "zh": "更换损坏的硬盘后，我们从备份恢复了数据。",
      "references": [
        "https://support.apple.com/en-gb/guide/iphone/iph1624229a/ios"
      ]
    },
    {
      "term": "missed call",
      "partOfSpeech": "noun phrase",
      "meaning": "① 未接来电。有人拨来但未被接听的电话。",
      "chineseAliases": [
        "未接来电",
        "未接电话"
      ],
      "englishForms": [
        "missed calls"
      ],
      "en": "I found two missed calls from my sister.",
      "zh": "我看到姐姐打来了两个未接电话。",
      "references": [
        "https://support.apple.com/en-lamr/109317"
      ]
    },
    {
      "term": "call forwarding",
      "partOfSpeech": "noun phrase",
      "meaning": "① 呼叫转移；来电转接。把打到一个号码的来电转到另一个号码的电话服务。",
      "chineseAliases": [
        "来电转接",
        "呼叫转移",
        "来电转移"
      ],
      "englishForms": [],
      "en": "Call forwarding sends calls from the office number to my mobile.",
      "zh": "呼叫转移会把打到办公室号码的电话转到我的手机上。",
      "references": [
        "https://support.apple.com/en-lamr/109317"
      ]
    },
    {
      "term": "smoke alarm",
      "partOfSpeech": "noun phrase",
      "meaning": "① 烟雾报警器。检测到烟雾时发出警报的装置。",
      "chineseAliases": [
        "烟雾报警器",
        "烟感报警器"
      ],
      "englishForms": [
        "smoke alarms"
      ],
      "en": "The landlord replaced the old smoke alarm in the hallway.",
      "zh": "房东更换了走廊里旧的烟雾报警器。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/smoke-alarm"
      ]
    },
    {
      "term": "carbon monoxide alarm",
      "partOfSpeech": "noun phrase",
      "meaning": "① 一氧化碳报警器；用于检测一氧化碳并发出警报的装置，区别于烟雾报警器。",
      "chineseAliases": [
        "一氧化碳报警器",
        "一氧化碳警报器"
      ],
      "englishForms": [
        "carbon monoxide alarms"
      ],
      "en": "The carbon monoxide alarm is separate from the smoke alarm.",
      "zh": "一氧化碳报警器和烟雾报警器是两个不同的装置。",
      "references": [
        "https://www.kidde.com/support/carbon-monoxide-alarms/why-is-my-carbon-monoxide-alarm-beeping-or-chirping"
      ]
    },
    {
      "term": "circuit breaker trip",
      "partOfSpeech": "noun phrase",
      "meaning": "① 断路器跳闸；断路器自动断开电路的动作或事件。不是一般意义上的所有停电。",
      "chineseAliases": [
        "跳闸",
        "断路器跳闸"
      ],
      "englishForms": [
        "circuit breaker trips"
      ],
      "en": "The electrician investigated the cause of the circuit breaker trip.",
      "zh": "电工检查了断路器跳闸的原因。",
      "references": [
        "https://iportal.se.com/Contents/docs/PowerPact%20B-Frame%20Circuit%20Breakers%20and%20Automatic%20Switches%20User%20Guide.pdf"
      ]
    },
    {
      "term": "paper towel",
      "partOfSpeech": "noun phrase",
      "meaning": "① 擦手纸；厨房纸。吸水性较强的纸巾，用于擦干双手、擦拭物品或吸收液体。",
      "chineseAliases": [
        "擦手纸",
        "厨房纸",
        "厨房纸巾",
        "擦手纸巾"
      ],
      "englishForms": [
        "paper towels"
      ],
      "en": "She dried her hands with a paper towel.",
      "zh": "她用一张擦手纸擦干了双手。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/paper-towel"
      ]
    },
    {
      "term": "trouser hanger",
      "partOfSpeech": "noun phrase",
      "meaning": "① 裤架；裤子衣架。用于悬挂裤子的衣架。",
      "chineseAliases": [
        "裤架",
        "裤子衣架",
        "挂裤架"
      ],
      "englishForms": [
        "trouser hangers"
      ],
      "en": "The trousers slipped off the trouser hanger during the move.",
      "zh": "搬家时，那条裤子从裤架上滑落了。",
      "references": [
        "https://www.ikea.com/th/th/files/pdf/b5/93/b5936a03/003_25-may-hotel-furniture-package.pdf"
      ]
    },
    {
      "term": "pilling",
      "partOfSpeech": "noun",
      "meaning": "① 起球；衣物起球。织物表面形成小纤维球的现象。",
      "chineseAliases": [
        "衣服起球",
        "衣物起球",
        "织物起球",
        "起毛球"
      ],
      "englishForms": [],
      "en": "There is some pilling on the sleeves of this old jumper.",
      "zh": "这件旧毛衣的袖子有些起球。",
      "references": [
        "https://www.ikea.com/be/en/circular/repair/cure-and-prevent-the-pilling-of-textiles-pub118a3730/"
      ]
    },
    {
      "term": "system backup",
      "partOfSpeech": "noun phrase",
      "meaning": "① 系统备份。为日后恢复系统而保存的相关数据副本，也指创建这种副本的过程。",
      "chineseAliases": [
        "系统备份",
        "电脑系统备份"
      ],
      "englishForms": [
        "system backups"
      ],
      "en": "The system backup is stored on an external drive.",
      "zh": "系统备份保存在外置硬盘上。",
      "references": [
        "https://support.microsoft.com/en-us/accessibility/windows/use-a-screen-reader-to-back-up-and-restore-data-on-windows"
      ]
    },
    {
      "term": "download software",
      "partOfSpeech": "verb phrase",
      "meaning": "① 下载软件。把软件从网络或其他设备传输到本机；下载不等于已经完成安装。",
      "chineseAliases": [
        "软件下载",
        "下载软件"
      ],
      "englishForms": [
        "downloads software",
        "downloaded software",
        "downloading software"
      ],
      "en": "You can download software from the developer's website.",
      "zh": "你可以从开发者的网站下载软件。",
      "references": [
        "https://www.collinsdictionary.com/dictionary/english/download-software"
      ]
    },
    {
      "term": "mute",
      "partOfSpeech": "verb",
      "meaning": "① 使静音；关闭设备、应用或某一路音频的声音。具体静音范围取决于所操作的对象。",
      "chineseAliases": [
        "静音",
        "设为静音",
        "使静音"
      ],
      "englishForms": [
        "mutes",
        "muting"
      ],
      "en": "I muted the video while I answered the door.",
      "zh": "我去应门时，把视频设为了静音。",
      "references": [
        "https://support.google.com/android/answer/9082609/change-volume-sound-amp-vibrate-settings"
      ]
    },
    {
      "term": "vibrate mode",
      "partOfSpeech": "noun phrase",
      "meaning": "① 振动模式；震动模式。电话或通知以振动而非铃声提醒的模式。",
      "chineseAliases": [
        "震动模式",
        "振动模式",
        "手机震动模式",
        "手机振动模式"
      ],
      "englishForms": [],
      "en": "My phone was in vibrate mode, so I felt the incoming call.",
      "zh": "我的手机开着振动模式，所以来电时我感觉到了振动。",
      "references": [
        "https://support.google.com/android/answer/9082609/change-volume-sound-amp-vibrate-settings"
      ]
    },
    {
      "term": "Do Not Disturb mode",
      "partOfSpeech": "noun phrase",
      "meaning": "① 勿扰模式；免打扰模式。按设置限制来电或通知等打扰的设备模式，可以允许指定例外。",
      "chineseAliases": [
        "免打扰模式",
        "勿扰模式",
        "手机勿扰模式"
      ],
      "englishForms": [],
      "en": "I enabled Do Not Disturb mode before going to bed.",
      "zh": "睡觉前，我开启了勿扰模式。",
      "references": [
        "https://support.google.com/android/answer/9069335?hl=en"
      ]
    },
    {
      "term": "spam text message",
      "partOfSpeech": "noun phrase",
      "meaning": "① 垃圾短信。未经请求收到的推销、骚扰等短信，不等于所有陌生号码发来的短信。",
      "chineseAliases": [
        "垃圾短信",
        "骚扰短信"
      ],
      "englishForms": [
        "spam text messages"
      ],
      "en": "I deleted a spam text message advertising a fake prize.",
      "zh": "我删除了一条以虚假奖品作宣传的垃圾短信。",
      "references": [
        "https://support.apple.com/en-lk/guide/iphone/iph203ab0be4/ios"
      ]
    },
    {
      "term": "call history",
      "partOfSpeech": "noun phrase",
      "meaning": "① 通话记录。设备或电话服务保存的已拨、已接、未接等电话记录。",
      "chineseAliases": [
        "通话记录",
        "电话记录",
        "电话通话记录"
      ],
      "englishForms": [
        "call histories"
      ],
      "en": "I checked my call history to find the number I dialled yesterday.",
      "zh": "我查看通话记录，找昨天拨过的号码。",
      "references": [
        "https://support.apple.com/en-ie/guide/iphone/iph21d1e1f56/ios"
      ]
    },
    {
      "term": "location services",
      "partOfSpeech": "plural noun",
      "meaning": "① 定位服务。设备用于确定或提供地理位置的功能或服务，可能结合 GPS、无线网络等信息。",
      "chineseAliases": [
        "定位服务",
        "位置服务",
        "手机定位服务"
      ],
      "englishForms": [],
      "en": "The weather app asked for permission to use location services.",
      "zh": "天气应用请求使用定位服务的权限。",
      "references": [
        "https://support.apple.com/en-us/102647"
      ]
    },
    {
      "term": "screen brightness",
      "partOfSpeech": "noun phrase",
      "meaning": "① 屏幕亮度。屏幕显示画面的明暗程度，可由设备设置调节。",
      "chineseAliases": [
        "屏幕亮度",
        "显示屏亮度"
      ],
      "englishForms": [],
      "en": "I lowered the screen brightness in the dark room.",
      "zh": "在昏暗的房间里，我调低了屏幕亮度。",
      "references": [
        "https://support.google.com/pixelphone/answer/6111557?hl=en-GB"
      ]
    },
    {
      "term": "automatic screen rotation",
      "partOfSpeech": "noun phrase",
      "meaning": "① 屏幕自动旋转。屏幕画面随设备方向自动切换横向或纵向显示的功能。",
      "chineseAliases": [
        "自动旋转",
        "屏幕自动旋转",
        "自动旋转屏幕"
      ],
      "englishForms": [],
      "en": "Automatic screen rotation is turned off on this tablet.",
      "zh": "这台平板电脑的屏幕自动旋转功能已关闭。",
      "references": [
        "https://support.google.com/pixelphone/answer/6111557?hl=en-GB"
      ]
    },
    {
      "term": "automatic screen lock",
      "partOfSpeech": "noun phrase",
      "meaning": "① 自动锁屏。设备在一定条件或一段未操作时间后自动锁定屏幕的功能。",
      "chineseAliases": [
        "自动锁屏",
        "屏幕自动锁定",
        "自动锁定屏幕"
      ],
      "englishForms": [],
      "en": "I changed the automatic screen lock delay to one minute.",
      "zh": "我把自动锁屏的等待时间改成了一分钟。",
      "references": [
        "https://support.apple.com/en-ie/guide/iphone/-iph7117338a8/ios"
      ]
    },
    {
      "term": "fingerprint unlock",
      "partOfSpeech": "noun phrase",
      "meaning": "① 指纹解锁。通过识别已登记的指纹来解除设备或应用的锁定。",
      "chineseAliases": [
        "指纹解锁",
        "指纹开锁"
      ],
      "englishForms": [],
      "en": "Fingerprint unlock works with either of my registered thumbs.",
      "zh": "用我登记过的任意一个拇指都能进行指纹解锁。",
      "references": [
        "https://support.google.com/pixelphone/answer/6285273?hl=en"
      ]
    },
    {
      "term": "facial recognition",
      "partOfSpeech": "noun phrase",
      "meaning": "① 人脸识别；面部识别。根据面部特征识别或验证身份的技术，可用于设备解锁等场景。",
      "chineseAliases": [
        "人脸识别",
        "面部识别",
        "脸部识别"
      ],
      "englishForms": [],
      "en": "This phone uses facial recognition to confirm the user's identity.",
      "zh": "这部手机通过人脸识别确认用户身份。",
      "references": [
        "https://support.apple.com/en-gb/102381?pubDate=20261018"
      ]
    },
    {
      "term": "USB power adapter",
      "partOfSpeech": "noun phrase",
      "meaning": "① USB 电源适配器；USB 充电头。连接电源、通过 USB 接口向设备供电的适配器，区别于充电线。",
      "chineseAliases": [
        "充电头",
        "USB充电头",
        "USB电源适配器",
        "手机充电头"
      ],
      "englishForms": [
        "USB power adapters",
        "USB power adaptor",
        "USB power adaptors"
      ],
      "en": "The USB power adapter and the charging cable are sold separately.",
      "zh": "USB 充电头和充电线分开出售。",
      "references": [
        "https://support.apple.com/en-gb/120548"
      ]
    },
    {
      "term": "three-pin plug",
      "partOfSpeech": "noun phrase",
      "meaning": "① 三脚插头；三针插头。带三个插脚的电源插头；不同地区的形状和规格可能不同。",
      "chineseAliases": [
        "三脚插头",
        "三针插头",
        "三脚电源插头"
      ],
      "englishForms": [
        "three-pin plugs"
      ],
      "en": "The lamp has a three-pin plug.",
      "zh": "这盏灯配的是三脚插头。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/plug"
      ]
    },
    {
      "term": "fire blanket",
      "partOfSpeech": "noun phrase",
      "meaning": "① 灭火毯。由不易燃烧的材料制成、用于覆盖火焰以帮助灭火或阻止蔓延的专用毯子。",
      "chineseAliases": [
        "灭火毯",
        "防火灭火毯"
      ],
      "englishForms": [
        "fire blankets"
      ],
      "en": "The fire blanket hangs in a red pouch near the kitchen door.",
      "zh": "灭火毯装在厨房门旁挂着的一个红色袋子里。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/fire-blanket"
      ]
    },
    {
      "term": "water leak",
      "partOfSpeech": "noun phrase",
      "meaning": "① 漏水；漏水处。水从管道、容器等不应出水的地方泄出的情况或位置。",
      "chineseAliases": [
        "漏水",
        "漏水处",
        "水管漏水"
      ],
      "englishForms": [
        "water leaks"
      ],
      "en": "A water leak under the sink had soaked the cupboard floor.",
      "zh": "水槽下面漏水，把橱柜底板浸湿了。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/leak"
      ]
    },
    {
      "term": "shrink",
      "partOfSpeech": "verb",
      "meaning": "① 缩小；收缩；（衣物等）缩水。变小或使尺寸变小。",
      "chineseAliases": [
        "缩水",
        "衣服缩水",
        "衣物缩水"
      ],
      "englishForms": [
        "shrinks",
        "shrank",
        "shrunk",
        "shrinking"
      ],
      "en": "These cotton sleeves may shrink slightly after washing.",
      "zh": "这些棉质袖子洗后可能会稍微缩水。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english-italian/shrink"
      ]
    },
    {
      "term": "shoelace",
      "partOfSpeech": "noun",
      "meaning": "① 鞋带。穿过鞋孔、用于系紧鞋子的带子。",
      "chineseAliases": [
        "鞋带",
        "系鞋的带子"
      ],
      "englishForms": [
        "shoelaces"
      ],
      "en": "One shoelace came undone while I was walking home.",
      "zh": "我走路回家时，一根鞋带松开了。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/shoelace"
      ]
    },
    {
      "term": "insole",
      "partOfSpeech": "noun",
      "meaning": "① 鞋垫；鞋内底。鞋里面、脚底踩着的那一层，或放进鞋内的垫片。",
      "chineseAliases": [
        "鞋垫",
        "鞋内垫",
        "鞋内底"
      ],
      "englishForms": [
        "insoles"
      ],
      "en": "The left insole keeps sliding forward inside my shoe.",
      "zh": "左脚鞋里的鞋垫总是往前滑。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/insole"
      ]
    },
    {
      "term": "bath towel",
      "partOfSpeech": "noun phrase",
      "meaning": "① 浴巾。洗澡或沐浴后用于擦干或包裹身体的较大毛巾。",
      "chineseAliases": [
        "浴巾",
        "洗澡浴巾"
      ],
      "englishForms": [
        "bath towels"
      ],
      "en": "I hung the damp bath towel on the rail to dry.",
      "zh": "我把湿浴巾挂在杆子上晾干。",
      "references": [
        "https://www.ikea.com/th/th/files/pdf/b5/93/b5936a03/003_25-may-hotel-furniture-package.pdf"
      ]
    },
    {
      "term": "plug",
      "partOfSpeech": "noun",
      "meaning": "① 插头；电源插头。带插脚、插入插座以连接电源的部件，区别于插座。",
      "chineseAliases": [
        "插头",
        "电源插头",
        "电插头"
      ],
      "englishForms": [
        "plugs"
      ],
      "en": "The plug was loose in the wall socket.",
      "zh": "插头在墙上的插座里插得不牢。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/plug"
      ]
    },
    {
      "term": "disposable chopsticks",
      "partOfSpeech": "plural noun phrase",
      "meaning": "① 一次性筷子：通常用过一次便丢弃的筷子。",
      "chineseAliases": [
        "一次性筷子"
      ],
      "englishForms": [
        "disposable chopsticks"
      ],
      "en": "The takeaway box came with a pair of disposable chopsticks.",
      "zh": "外卖盒附了一双一次性筷子。",
      "references": [
        "https://www.legco.gov.hk/yr17-18/english/counmtg/papers/cm20180124-sp068-e.pdf"
      ]
    },
    {
      "term": "refill",
      "partOfSpeech": "noun · verb",
      "meaning": "① 续杯；给杯中再添饮品（动词）。② 再添的一份饮品（名词）。这里取餐饮用法。",
      "chineseAliases": [
        "续杯",
        "续添饮品"
      ],
      "englishForms": [
        "refill",
        "refills",
        "refilled",
        "refilling"
      ],
      "en": "Could you refill my glass with water, please?",
      "zh": "请给我的杯子再添些水，好吗？",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/refill"
      ]
    },
    {
      "term": "free refill",
      "partOfSpeech": "noun phrase",
      "meaning": "① 免费续杯；不另收费的续添饮品。是否提供、可续多少次要看具体服务，不自带无限次的意思。",
      "chineseAliases": [
        "免费续杯",
        "免费的续杯"
      ],
      "englishForms": [
        "free refill",
        "free refills"
      ],
      "en": "The menu says that a free refill is included with this coffee.",
      "zh": "菜单上写着，这杯咖啡包含一次免费续杯。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/refill"
      ]
    },
    {
      "term": "unsweetened",
      "partOfSpeech": "adjective",
      "meaning": "① 未添加糖或其他甜味物质的。点饮品时可用来表达不加糖，不表示原料本身一定完全没有糖。",
      "chineseAliases": [
        "不加糖",
        "不加糖的",
        "未加糖的",
        "未加甜味剂的"
      ],
      "englishForms": [
        "unsweetened"
      ],
      "en": "Could I have the iced tea unsweetened, with a slice of lemon?",
      "zh": "我的冰茶可以不加糖，再放一片柠檬吗？",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/unsweetened?topic=flavours-and-tastes"
      ]
    },
    {
      "term": "less sugar",
      "partOfSpeech": "phrase",
      "meaning": "① 少糖；比通常的量少放一些糖。点单时的简略表达，并不指定固定甜度百分比。",
      "chineseAliases": [
        "少糖",
        "少放糖",
        "少加糖"
      ],
      "englishForms": [
        "less sugar"
      ],
      "en": "I would like the milk tea with less sugar than usual.",
      "zh": "我的奶茶想比平常少放些糖。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english-korean/less"
      ]
    },
    {
      "term": "less salt",
      "partOfSpeech": "phrase",
      "meaning": "① 少盐；比通常的量少放一些盐。这里是餐饮口味要求。",
      "chineseAliases": [
        "少盐",
        "少放盐",
        "少加盐"
      ],
      "englishForms": [
        "less salt"
      ],
      "en": "Could the kitchen make my noodles with less salt?",
      "zh": "厨房可以把我的面条做得少放些盐吗？",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english-korean/less",
        "https://dictionary.cambridge.org/us/dictionary/english/ready-meal"
      ]
    },
    {
      "term": "mildly spicy",
      "partOfSpeech": "adjective phrase",
      "meaning": "① 微辣的；辣味较轻、只有一点辣味的，用来形容食物。",
      "chineseAliases": [
        "微辣",
        "微辣的",
        "稍辣的"
      ],
      "englishForms": [
        "mildly spicy"
      ],
      "en": "My sister ordered the mildly spicy curry.",
      "zh": "我姐姐点了微辣的咖喱。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/mild"
      ]
    },
    {
      "term": "medium",
      "partOfSpeech": "adjective",
      "meaning": "① （肉的熟度）中等的；点牛排时常称五分熟。这里不取媒介或尺寸的名词义。",
      "chineseAliases": [
        "五分熟",
        "五分熟的"
      ],
      "englishForms": [
        "medium"
      ],
      "en": "The server asked whether I wanted my steak medium or well done.",
      "zh": "服务员问我的牛排要五分熟还是全熟。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/medium?topic=preparing-food-using-heat"
      ]
    },
    {
      "term": "well-done",
      "partOfSpeech": "adjective",
      "meaning": "① （肉）完全烹熟的；点牛排时称全熟。这里不取赞扬别人做得好的用法。",
      "chineseAliases": [
        "全熟",
        "全熟的",
        "烹熟透的"
      ],
      "englishForms": [
        "well-done"
      ],
      "en": "The well-done steak arrived with potatoes and green beans.",
      "zh": "全熟牛排配着土豆和四季豆端了上来。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/well-done"
      ]
    },
    {
      "term": "wait for a table",
      "partOfSpeech": "verb phrase",
      "meaning": "① 等位；等待餐厅有空桌可以入座。",
      "chineseAliases": [
        "排队等位",
        "等位",
        "等餐桌"
      ],
      "englishForms": [
        "wait for a table",
        "waits for a table",
        "waited for a table",
        "waiting for a table"
      ],
      "en": "We waited for a table near the window and read the menu outside.",
      "zh": "我们在外面看着菜单，等待一张靠窗的空桌。",
      "references": [
        "https://learnenglish.britishcouncil.org/sites/podcasts/files/Word_on_the_Street_Jobs_Scene_1_Transcript.pdf",
        "https://www.opentable.com/restaurant/profile/1045231"
      ]
    },
    {
      "term": "book a table",
      "partOfSpeech": "verb phrase",
      "meaning": "① 预订餐桌；提前请餐厅保留用餐座位。",
      "chineseAliases": [
        "预订餐桌",
        "订餐桌",
        "预约餐桌"
      ],
      "englishForms": [
        "book a table",
        "books a table",
        "booked a table",
        "booking a table"
      ],
      "en": "I booked a table for Saturday evening before inviting my friends.",
      "zh": "我先预订了星期六晚上的餐桌，再邀请朋友。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/book?topic=rules-and-laws"
      ]
    },
    {
      "term": "table for two",
      "partOfSpeech": "noun phrase",
      "meaning": "① 供两人用餐的桌位；向餐厅询问两个人的座位时常用。",
      "chineseAliases": [
        "两人桌",
        "两人餐桌",
        "两个人的桌位"
      ],
      "englishForms": [
        "table for two",
        "tables for two"
      ],
      "en": "We asked for a table for two in the quieter part of the restaurant.",
      "zh": "我们想在餐厅比较安静的区域要一张两人桌。",
      "references": [
        "https://learnenglish.britishcouncil.org/sites/podcasts/files/Word_on_the_Street_Jobs_Scene_1_Transcript.pdf"
      ]
    },
    {
      "term": "restaurant waiting list",
      "partOfSpeech": "noun phrase",
      "meaning": "① 餐厅等位名单：登记等待空桌的客人姓名或号码的名单。",
      "chineseAliases": [
        "等位名单",
        "餐厅等位名单",
        "等位登记名单"
      ],
      "englishForms": [
        "restaurant waiting list",
        "restaurant waiting lists"
      ],
      "en": "Our name was added to the restaurant waiting list while we looked at the menu.",
      "zh": "我们看菜单时，姓名被加入了餐厅等位名单。",
      "references": [
        "https://www.opentable.com/restaurant/profile/1045231"
      ]
    },
    {
      "term": "share a table",
      "partOfSpeech": "verb phrase",
      "meaning": "① 拼桌；与另一组客人共用一张餐桌。这里不只是与同行朋友一起吃饭。",
      "chineseAliases": [
        "拼桌",
        "和别的客人拼桌"
      ],
      "englishForms": [
        "share a table",
        "shares a table",
        "shared a table",
        "sharing a table"
      ],
      "en": "We shared a table with another couple because the café was crowded.",
      "zh": "咖啡馆很拥挤，我们就和另一对客人拼了桌。",
      "references": [
        "https://learnenglish.britishcouncil.org/sites/podcasts/files/Word_on_the_Street_Jobs_Scene_1_Transcript.pdf"
      ]
    },
    {
      "term": "oat milk",
      "partOfSpeech": "noun phrase",
      "meaning": "① 燕麦奶；以燕麦和水等制成、用作奶类替代品的植物饮料。",
      "chineseAliases": [
        "燕麦奶",
        "燕麦植物奶"
      ],
      "englishForms": [
        "oat milk"
      ],
      "en": "The café ran out of oat milk just before my turn to order.",
      "zh": "刚轮到我点单前，咖啡馆的燕麦奶用完了。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/oat-milk"
      ]
    },
    {
      "term": "lactose-free milk",
      "partOfSpeech": "noun phrase",
      "meaning": "① 无乳糖牛奶；经过处理、乳糖已被除去或分解的牛奶。它仍是乳制品，不等同植物奶。",
      "chineseAliases": [
        "无乳糖牛奶",
        "无乳糖奶"
      ],
      "englishForms": [
        "lactose-free milk"
      ],
      "en": "I put the carton of lactose-free milk on the middle shelf of the fridge.",
      "zh": "我把那盒无乳糖牛奶放在冰箱中层。",
      "references": [
        "https://www.arlafoods.co.uk/brands/lactofree/all-articles/is-lactose-free-milk-dairy-free/"
      ]
    },
    {
      "term": "dinner plate",
      "partOfSpeech": "noun phrase",
      "meaning": "① 餐盘；盛放正餐饭菜的盘子，不是端餐用的托盘。",
      "chineseAliases": [
        "餐盘",
        "正餐盘",
        "盛饭菜的盘子"
      ],
      "englishForms": [
        "dinner plate",
        "dinner plates"
      ],
      "en": "She placed a clean dinner plate in front of each guest.",
      "zh": "她在每位客人面前放了一个干净的餐盘。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/dinner"
      ]
    },
    {
      "term": "train platform",
      "partOfSpeech": "noun phrase",
      "meaning": "① 火车站台；供乘客等候、上下列车的站内平台，不指路边公交站。",
      "chineseAliases": [
        "火车站台",
        "铁路站台",
        "列车站台"
      ],
      "englishForms": [
        "train platform",
        "train platforms"
      ],
      "en": "The train platform was nearly empty when we arrived.",
      "zh": "我们到达时，火车站台上几乎没有人。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/platform"
      ]
    },
    {
      "term": "change trains",
      "partOfSpeech": "verb phrase",
      "meaning": "① 换乘列车；下车后改乘另一班列车继续行程，也可用于地铁换乘。",
      "chineseAliases": [
        "地铁换乘",
        "换乘列车",
        "换乘地铁",
        "火车换乘"
      ],
      "englishForms": [
        "change trains",
        "changes trains",
        "changed trains",
        "changing trains"
      ],
      "en": "You need to change trains once to reach the museum.",
      "zh": "去博物馆需要换乘一次列车。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/change"
      ]
    },
    {
      "term": "ticket gate",
      "partOfSpeech": "noun phrase",
      "meaning": "① 检票口；车站核验车票后进入或离开的闸口，常指检票闸机。它不是列车停靠的站台。",
      "chineseAliases": [
        "检票口",
        "检票闸机",
        "车站检票口"
      ],
      "englishForms": [
        "ticket gate",
        "ticket gates"
      ],
      "en": "I waited beside the ticket gate while my friend looked for her ticket.",
      "zh": "朋友找车票时，我在检票口旁等她。",
      "references": [
        "https://www.jreast.co.jp/e/downloads/pdf/jr-east_guide_e.pdf"
      ]
    },
    {
      "term": "passport control",
      "partOfSpeech": "noun phrase",
      "meaning": "① 护照检查处；在机场、港口或边境核查旅客护照的环节或区域，不等同检查携带物品的海关。",
      "chineseAliases": [
        "护照检查",
        "护照检查处",
        "边检护照检查"
      ],
      "englishForms": [
        "passport control"
      ],
      "en": "We joined the queue for passport control after leaving the plane.",
      "zh": "下飞机后，我们加入了护照检查的队伍。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/passport-control"
      ]
    },
    {
      "term": "customs declaration",
      "partOfSpeech": "noun phrase",
      "meaning": "① 海关申报；向海关正式报告进出境物品信息，也可指相关申报单。",
      "chineseAliases": [
        "海关申报",
        "海关申报单",
        "海关物品申报"
      ],
      "englishForms": [
        "customs declaration",
        "customs declarations"
      ],
      "en": "She checked the item descriptions before submitting the customs declaration.",
      "zh": "提交海关申报单前，她检查了物品描述。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/customs-declaration"
      ]
    },
    {
      "term": "luggage locker",
      "partOfSpeech": "noun phrase",
      "meaning": "① 行李寄存柜；可暂时存放并锁住行李的储物柜，不指有人看管的寄存柜台。",
      "chineseAliases": [
        "行李寄存柜",
        "自助行李寄存柜"
      ],
      "englishForms": [
        "luggage locker",
        "luggage lockers"
      ],
      "en": "We left the backpack in a luggage locker and explored the town.",
      "zh": "我们把背包放在行李寄存柜里，然后去城里逛了逛。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/locker"
      ]
    },
    {
      "term": "baggage carousel",
      "partOfSpeech": "noun phrase",
      "meaning": "① 行李传送带；机场供旅客领取托运行李的循环传送装置。",
      "chineseAliases": [
        "行李传送带",
        "机场行李传送带",
        "行李转盘"
      ],
      "englishForms": [
        "baggage carousel",
        "baggage carousels"
      ],
      "en": "Our suitcase appeared on the baggage carousel just as we reached it.",
      "zh": "我们刚走到行李传送带旁，箱子就出来了。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/carousel"
      ]
    },
    {
      "term": "accessible entrance",
      "partOfSpeech": "noun phrase",
      "meaning": "① 无障碍入口；为有无障碍通行需求的人提供的入口，例如方便轮椅使用者进入的入口。",
      "chineseAliases": [
        "无障碍入口",
        "无障碍通行入口"
      ],
      "englishForms": [
        "accessible entrance",
        "accessible entrances"
      ],
      "en": "A sign beside the steps pointed towards the accessible entrance.",
      "zh": "台阶旁的一块标牌指向无障碍入口。",
      "references": [
        "https://www.access-board.gov/ada/guides/chapter-4-entrances-doors-and-gates/"
      ]
    },
    {
      "term": "walking directions",
      "partOfSpeech": "plural noun phrase",
      "meaning": "① 步行路线指引；告诉行人如何步行到目的地的路线或导航说明。",
      "chineseAliases": [
        "步行路线",
        "步行导航",
        "步行指引"
      ],
      "englishForms": [
        "walking directions"
      ],
      "en": "The walking directions took us through a small square behind the station.",
      "zh": "步行导航路线带我们穿过了车站后面的一个小广场。",
      "references": [
        "https://support.google.com/maps/answer/144339?hl=en"
      ]
    },
    {
      "term": "pedestrian crossing button",
      "partOfSpeech": "noun phrase",
      "meaning": "① 行人过街按钮；在人行横道信号装置上，供行人提出过街请求的按钮。",
      "chineseAliases": [
        "行人过街按钮",
        "行人过街信号按钮",
        "过街按钮"
      ],
      "englishForms": [
        "pedestrian crossing button",
        "pedestrian crossing buttons"
      ],
      "en": "The pedestrian crossing button was mounted beside the kerb.",
      "zh": "行人过街按钮安装在路缘旁。",
      "references": [
        "https://www.tfl.gov.uk/cdn/static/cms/documents/design-standards-signal-schemes.pdf"
      ]
    },
    {
      "term": "transit card",
      "partOfSpeech": "noun phrase",
      "meaning": "① 交通卡；用来支付公交、地铁等公共交通费用的卡。具体可用线路取决于当地系统。",
      "chineseAliases": [
        "交通卡",
        "公交卡",
        "公共交通卡"
      ],
      "englishForms": [
        "transit card",
        "transit cards"
      ],
      "en": "She tapped her transit card and walked through the gate.",
      "zh": "她刷了一下交通卡，走过了闸机。",
      "references": [
        "https://www.clippercard.com/ClipperWeb/account-management.html"
      ]
    },
    {
      "term": "top up a transit card",
      "partOfSpeech": "verb phrase",
      "meaning": "① 给交通卡充值；向卡里添加以后乘车使用的余额。",
      "chineseAliases": [
        "交通卡充值",
        "公交卡充值",
        "给交通卡充值"
      ],
      "englishForms": [
        "top up a transit card",
        "tops up a transit card",
        "topped up a transit card",
        "topping up a transit card"
      ],
      "en": "I need to top up my transit card before tomorrow's commute.",
      "zh": "明天通勤前，我需要给交通卡充值。",
      "references": [
        "https://tfl.gov.uk/maps_/pay-in-tfl-go"
      ]
    },
    {
      "term": "on-street parking",
      "partOfSpeech": "noun phrase",
      "meaning": "① 路边停车；在道路旁划设或允许的位置停车，不是驶入独立停车场停车。",
      "chineseAliases": [
        "路边停车",
        "街边停车",
        "道路旁停车"
      ],
      "englishForms": [
        "on-street parking"
      ],
      "en": "We looked for on-street parking near the bookshop.",
      "zh": "我们在书店附近找路边停车位。",
      "references": [
        "https://www.gov.uk/government/publications/know-your-traffic-signs/on-street-parking-control-signs-and-road-markings"
      ]
    },
    {
      "term": "time-limited parking",
      "partOfSpeech": "noun phrase",
      "meaning": "① 限时停车；设有最长允许停留时间的停车安排，不一定免费。",
      "chineseAliases": [
        "限时停车",
        "有时限的停车"
      ],
      "englishForms": [
        "time-limited parking"
      ],
      "en": "The sign indicated time-limited parking outside the shops.",
      "zh": "标牌表明商店外实行限时停车。",
      "references": [
        "https://www.gov.uk/government/publications/know-your-traffic-signs/on-street-parking-control-signs-and-road-markings"
      ]
    },
    {
      "term": "shared bike",
      "partOfSpeech": "noun phrase",
      "meaning": "① 共享单车；供公众通过共享租借方式短时使用的自行车。",
      "chineseAliases": [
        "共享单车",
        "共享自行车"
      ],
      "englishForms": [
        "shared bike",
        "shared bikes"
      ],
      "en": "We left the shared bikes in the marked parking area.",
      "zh": "我们把共享单车停在了标记出的停车区。",
      "references": [
        "https://haveyoursay.threerivers.gov.uk/beryl-bikes-bays?tool=survey_tool&tool_id=beryl-bike"
      ]
    },
    {
      "term": "take a detour",
      "partOfSpeech": "verb phrase",
      "meaning": "① 绕行；暂时改走另一条路线，通常因为原路不通或想顺路到别处。",
      "chineseAliases": [
        "绕行",
        "绕路",
        "改道绕行"
      ],
      "englishForms": [
        "take a detour",
        "takes a detour",
        "took a detour",
        "taken a detour",
        "taking a detour"
      ],
      "en": "We had to take a detour because the bridge was closed.",
      "zh": "大桥关闭了，我们只好绕行。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/detour"
      ]
    },
    {
      "term": "timetable",
      "partOfSpeech": "noun",
      "meaning": "① 时刻表；列明公交、火车等交通工具到达或离开时间的表。本例取公共交通义。",
      "chineseAliases": [
        "时刻表",
        "列车时刻表",
        "公交时刻表"
      ],
      "englishForms": [
        "timetable",
        "timetables"
      ],
      "en": "I checked the timetable to see when the next train would leave.",
      "zh": "我查了时刻表，看看下一班火车何时出发。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/timetable"
      ]
    },
    {
      "term": "course registration",
      "partOfSpeech": "noun phrase",
      "meaning": "① 选课登记；在学校系统中注册要修读的课程，不是酒店入住登记或机场值机。",
      "chineseAliases": [
        "选课",
        "课程注册",
        "选课登记",
        "课程选修登记"
      ],
      "englishForms": [
        "course registration"
      ],
      "en": "We completed course registration after meeting our advisers.",
      "zh": "和导师会面后，我们完成了选课登记。",
      "references": [
        "https://www.college.upenn.edu/academics/course-selection/course-registration?page=1"
      ]
    },
    {
      "term": "add a course",
      "partOfSpeech": "verb phrase",
      "meaning": "① 加课；把一门课程加入自己的选课安排。",
      "chineseAliases": [
        "加课",
        "加选课程",
        "添加课程到课表"
      ],
      "englishForms": [
        "add a course",
        "adds a course",
        "added a course",
        "adding a course"
      ],
      "en": "She decided to add a course after discussing her timetable with an adviser.",
      "zh": "和导师讨论课表后，她决定加选一门课程。",
      "references": [
        "https://www.college.upenn.edu/sites/default/files/files/HowToAddDropSwapClassesQRG.pdf"
      ]
    },
    {
      "term": "drop a course",
      "partOfSpeech": "verb phrase",
      "meaning": "① 退课；取消自己已经选修的一门课程，不表示退学。具体手续及记录依学校规定。",
      "chineseAliases": [
        "退课",
        "退选课程",
        "取消选修课程"
      ],
      "englishForms": [
        "drop a course",
        "drops a course",
        "dropped a course",
        "dropping a course"
      ],
      "en": "I decided to drop a course because two classes met at the same time.",
      "zh": "两门课的上课时间冲突，我决定退掉其中一门。",
      "references": [
        "https://www.college.upenn.edu/sites/default/files/files/HowToAddDropSwapClassesQRG.pdf"
      ]
    },
    {
      "term": "prerequisite course",
      "partOfSpeech": "noun phrase",
      "meaning": "① 先修课；修读另一门课程前要求已经学过的课程。",
      "chineseAliases": [
        "先修课",
        "先修课程",
        "前置课程"
      ],
      "englishForms": [
        "prerequisite course",
        "prerequisite courses"
      ],
      "en": "Introductory statistics is a prerequisite course for this seminar.",
      "zh": "统计学导论是这门研讨课的先修课程。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/prerequisite?topic=important-and-essential-things"
      ]
    },
    {
      "term": "syllabus",
      "partOfSpeech": "noun",
      "meaning": "① 课程大纲；说明课程内容、学习安排及有关要求的文件或计划。",
      "chineseAliases": [
        "课程大纲",
        "教学大纲"
      ],
      "englishForms": [
        "syllabus",
        "syllabuses",
        "syllabi"
      ],
      "en": "The syllabus lists the readings for the first four weeks.",
      "zh": "课程大纲列出了前四周的阅读材料。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/syllabus"
      ]
    },
    {
      "term": "proof of enrolment",
      "partOfSpeech": "noun phrase",
      "meaning": "① 在读证明；证明目前在某学校或课程注册就读的正式材料。",
      "chineseAliases": [
        "在读证明",
        "就读证明",
        "当前在读证明"
      ],
      "englishForms": [
        "proof of enrolment",
        "proof of enrollment"
      ],
      "en": "The scholarship office asked for proof of enrolment for the current term.",
      "zh": "奖学金办公室要求提供本学期的在读证明。",
      "references": [
        "https://www.unsw.edu.au/student/support/financial-support/centrelink"
      ]
    },
    {
      "term": "group assignment",
      "partOfSpeech": "noun phrase",
      "meaning": "① 小组作业；由一组学生合作完成的课程任务。",
      "chineseAliases": [
        "小组作业",
        "分组作业",
        "小组课程作业"
      ],
      "englishForms": [
        "group assignment",
        "group assignments"
      ],
      "en": "We divided the research for the group assignment before writing the report together.",
      "zh": "我们先分担小组作业的资料研究，再一起撰写报告。",
      "references": [
        "https://www.student.unsw.edu.au/groupwork"
      ]
    },
    {
      "term": "academic integrity",
      "partOfSpeech": "noun phrase",
      "meaning": "① 学术诚信；在学习与研究中诚实地完成、呈现自己的工作，并恰当注明他人贡献等原则。",
      "chineseAliases": [
        "学术诚信",
        "学术诚实原则"
      ],
      "englishForms": [
        "academic integrity"
      ],
      "en": "The workshop used examples to explain academic integrity in group projects.",
      "zh": "研讨活动用例子说明了小组项目中的学术诚信。",
      "references": [
        "https://catalog.upenn.edu/pennbook/code-of-academic-integrity/"
      ]
    },
    {
      "term": "citation style",
      "partOfSpeech": "noun phrase",
      "meaning": "① 引用格式；规定文内引用和资料来源信息如何书写、排列的一套规则。",
      "chineseAliases": [
        "引用格式",
        "引文格式",
        "引用规范"
      ],
      "englishForms": [
        "citation style",
        "citation styles"
      ],
      "en": "The instructor asked us to use one citation style consistently throughout the essay.",
      "zh": "老师要求我们在整篇文章中统一使用一种引用格式。",
      "references": [
        "https://guides.library.upenn.edu/citationpractices/citationstyles"
      ]
    },
    {
      "term": "reference list",
      "partOfSpeech": "noun phrase",
      "meaning": "① 参考文献表；列出文中引用资料及其书目信息的清单，便于读者识别和查找来源。",
      "chineseAliases": [
        "参考文献",
        "参考文献表",
        "参考文献列表",
        "文后参考文献"
      ],
      "englishForms": [
        "reference list",
        "reference lists"
      ],
      "en": "I noticed that one source cited in the essay was missing from the reference list.",
      "zh": "我发现文章中引用的一项资料没有列在参考文献表里。",
      "references": [
        "https://apastyle.apa.org/style-grammar-guidelines/paper-format/reference-list"
      ]
    },
    {
      "term": "similarity check",
      "partOfSpeech": "noun phrase",
      "meaning": "① 查重；检查文本与已有资料的相似内容。结果显示相似之处，本身不等于认定抄袭。",
      "chineseAliases": [
        "查重",
        "文本查重",
        "相似度检查"
      ],
      "englishForms": [
        "similarity check",
        "similarity checks"
      ],
      "en": "The similarity check highlighted a quotation that already had a citation.",
      "zh": "查重标出了一段已经注明引用出处的引文。",
      "references": [
        "https://guides.turnitin.com/hc/en-us/articles/23713493434253-Understanding-the-similarity-score-for-students"
      ]
    },
    {
      "term": "payslip",
      "partOfSpeech": "noun",
      "meaning": "① 工资单；列出一定期间工资收入及有关扣款的记录，英式英语常用。",
      "chineseAliases": [
        "薪资单",
        "工资单",
        "薪水单"
      ],
      "englishForms": [
        "payslip",
        "payslips",
        "pay slip",
        "pay slips"
      ],
      "en": "I saved the payslip in a folder with my employment contract.",
      "zh": "我把工资单保存在放有劳动合同的文件夹里。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/pay-slip"
      ]
    },
    {
      "term": "net pay",
      "partOfSpeech": "noun phrase",
      "meaning": "① 实发工资；扣除税费及其他应扣项目后，实际支付给员工的工资金额。",
      "chineseAliases": [
        "实发工资",
        "到手工资",
        "税后实发工资"
      ],
      "englishForms": [
        "net pay"
      ],
      "en": "The net pay shown on my payslip matched the amount in my bank account.",
      "zh": "工资单上显示的实发工资与银行账户中的入账金额一致。",
      "references": [
        "https://www.gov.uk/guidance/check-if-the-tax-on-your-payslip-is-correct"
      ]
    },
    {
      "term": "gross pay",
      "partOfSpeech": "noun phrase",
      "meaning": "① 税前工资总额；尚未扣除税费及其他扣款的工资金额。",
      "chineseAliases": [
        "税前工资",
        "税前工资总额",
        "未扣款工资"
      ],
      "englishForms": [
        "gross pay"
      ],
      "en": "The offer letter stated the gross pay but did not calculate my take-home amount.",
      "zh": "录用信列明了税前工资，但没有计算我的到手金额。",
      "references": [
        "https://www.gov.uk/guidance/check-if-the-tax-on-your-payslip-is-correct"
      ]
    },
    {
      "term": "teaching assistant",
      "partOfSpeech": "noun phrase",
      "meaning": "① 教学助理、助教；协助教师开展教学和帮助学生学习的人。具体职责随学校与课程而异。",
      "chineseAliases": [
        "助教",
        "教学助理",
        "课程助教"
      ],
      "englishForms": [
        "teaching assistant",
        "teaching assistants"
      ],
      "en": "The teaching assistant helped our group understand the instructions for the exercise.",
      "zh": "助教帮助我们小组理解了练习要求。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/teaching-assistant"
      ]
    },
    {
      "term": "internship",
      "partOfSpeech": "noun",
      "meaning": "① 实习；在公司或机构工作一段时间，以获得某类工作的实际经验。本例不取医生住院培训义。",
      "chineseAliases": [
        "实习",
        "实习工作",
        "工作实习"
      ],
      "englishForms": [
        "internship",
        "internships"
      ],
      "en": "During her internship, she kept a notebook of the tasks she was learning.",
      "zh": "实习期间，她把正在学习的工作任务记在一本笔记本里。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/internship"
      ]
    },
    {
      "term": "resit",
      "partOfSpeech": "noun · verb",
      "meaning": "① 重考；再次参加考试，通常因为第一次未通过或表现不佳（动词，英式英语）。② 重考的那场考试（名词）；与缺考后补做考试应按具体情况区分。",
      "chineseAliases": [
        "补考",
        "重考",
        "未通过后的补考",
        "不及格后的重考"
      ],
      "englishForms": [
        "resit",
        "resits",
        "resat",
        "resitting"
      ],
      "en": "He revised with a study group before the resit.",
      "zh": "重考前，他和学习小组一起复习。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/resit"
      ]
    },
    {
      "term": "get a replacement student ID",
      "partOfSpeech": "verb phrase",
      "meaning": "① 补办学生证；取得因原证件遗失、损坏等原因而补发的学生证件。",
      "chineseAliases": [
        "补办学生证",
        "申请补发学生证",
        "补领学生证"
      ],
      "englishForms": [
        "get a replacement student ID",
        "gets a replacement student ID",
        "got a replacement student ID",
        "getting a replacement student ID"
      ],
      "en": "After losing my card, I asked how to get a replacement student ID.",
      "zh": "学生证丢失后，我询问了怎样补办。",
      "references": [
        "https://shop.salford.ac.uk/product-catalogue/student-administration/student-id-cards/replacement-student-id-card"
      ]
    },
    {
      "term": "return window",
      "partOfSpeech": "noun phrase",
      "meaning": "① 退货期限；商家允许申请或办理退货的那段时间，不是每天接待退货的营业时段。",
      "chineseAliases": [
        "退货期限",
        "可退货期限",
        "退货窗口期"
      ],
      "englishForms": [
        "return windows"
      ],
      "en": "I checked the return window before ordering the shoes.",
      "zh": "订购那双鞋前，我查看了退货期限。",
      "references": [
        "https://www.target.com/help/article/000061980"
      ]
    },
    {
      "term": "request a refund",
      "partOfSpeech": "verb phrase",
      "meaning": "① 申请退款；提出退还已付款项的请求，不表示退款已经获批或到账。",
      "chineseAliases": [
        "申请退款",
        "请求退款",
        "提交退款申请"
      ],
      "englishForms": [
        "requested a refund",
        "requesting a refund",
        "requests a refund"
      ],
      "en": "I requested a refund after the concert was cancelled.",
      "zh": "演唱会取消后，我申请了退款。",
      "references": [
        "https://support.apple.com/en-lamr/118223"
      ]
    },
    {
      "term": "deny a refund",
      "partOfSpeech": "verb phrase",
      "meaning": "① 拒绝退款；不批准退还款项的请求。主动结构，主语是拒绝退款的店家、机构等。",
      "chineseAliases": [
        "拒绝退款"
      ],
      "englishForms": [
        "denied a refund",
        "denying a refund",
        "denies a refund"
      ],
      "en": "The shop denied a refund because the shoes had been worn outdoors.",
      "zh": "店家因为那双鞋已经穿到户外使用而拒绝退款。",
      "references": [
        "https://www.target.com/help/article/000061980"
      ]
    },
    {
      "term": "cancel an order",
      "partOfSpeech": "verb phrase",
      "meaning": "① 取消订单；要求停止一笔购买订单，不等同于已发货后办理退货。",
      "chineseAliases": [
        "取消订单",
        "订单取消",
        "撤销订单"
      ],
      "englishForms": [
        "cancelled an order",
        "canceled an order",
        "cancelling an order",
        "canceling an order",
        "cancels an order"
      ],
      "en": "I cancelled an order for two lamps before it was dispatched.",
      "zh": "那笔购买两盏灯的订单发货前，我把它取消了。",
      "references": [
        "https://www.apple.com/shop/help"
      ]
    },
    {
      "term": "refund status",
      "partOfSpeech": "noun phrase",
      "meaning": "① 退款处理状态；退款目前处于审核、处理中或已完成等哪个阶段。",
      "chineseAliases": [
        "退款进度",
        "退款状态",
        "退款处理状态"
      ],
      "englishForms": [
        "refund statuses"
      ],
      "en": "The refund status changed from pending to completed this morning.",
      "zh": "今天早上，退款状态从待处理变成了已完成。",
      "references": [
        "https://support.apple.com/en-lamr/118223",
        "https://www.apple.com/shop/help/payments"
      ]
    },
    {
      "term": "exchange for the next size up",
      "partOfSpeech": "verb phrase",
      "meaning": "① 换大一码；将商品换成尺码序列中下一个较大的尺码，不泛指换成任意更大的尺码。",
      "chineseAliases": [
        "换大一码",
        "换大一号",
        "换为下一个较大尺码"
      ],
      "englishForms": [
        "exchanged for the next size up",
        "exchanging for the next size up"
      ],
      "en": "Could I exchange these trousers for the next size up?",
      "zh": "这条裤子能换大一码吗？",
      "references": [
        "https://www.target.com/help/articles/returns-exchanges/returns"
      ]
    },
    {
      "term": "exchange for the next size down",
      "partOfSpeech": "verb phrase",
      "meaning": "① 换小一码；将商品换成尺码序列中下一个较小的尺码，不泛指换成任意更小的尺码。",
      "chineseAliases": [
        "换小一码",
        "换小一号",
        "换为下一个较小尺码"
      ],
      "englishForms": [
        "exchanged for the next size down",
        "exchanging for the next size down"
      ],
      "en": "I need to exchange this jacket for the next size down.",
      "zh": "我需要把这件夹克换小一码。",
      "references": [
        "https://www.target.com/help/articles/returns-exchanges/returns"
      ]
    },
    {
      "term": "missing item",
      "partOfSpeech": "noun phrase",
      "meaning": "① 订单中缺少或未收到的商品。本例指少收到一件，不是收到错误商品。",
      "chineseAliases": [
        "漏发商品",
        "少发商品",
        "订单中缺少的商品"
      ],
      "englishForms": [
        "missing items"
      ],
      "en": "The packing list showed three mugs, but only two arrived; I reported the missing item.",
      "zh": "装箱单上列了三个杯子，却只送到两个，我便报告了少发的那件商品。",
      "references": [
        "https://www.target.com/help/articles/returns-exchanges/returns"
      ]
    },
    {
      "term": "wrong item",
      "partOfSpeech": "noun phrase",
      "meaning": "① 发错或拿错的商品；实际收到或选中的物品不是所需的那件。本例指商家发错货。",
      "chineseAliases": [
        "发错商品",
        "发错货",
        "收到错误商品"
      ],
      "englishForms": [
        "wrong items"
      ],
      "en": "The shop sent the wrong item: a desk lamp instead of a kettle.",
      "zh": "店家发错了商品：我收到的是台灯，而不是水壶。",
      "references": [
        "https://www.target.com/help/articles/returns-exchanges/returns"
      ]
    },
    {
      "term": "damaged item",
      "partOfSpeech": "noun phrase",
      "meaning": "① 破损或受损的商品；本例指收到时已有损坏，不等同于完好但买错的商品。",
      "chineseAliases": [
        "商品损坏",
        "破损商品",
        "受损商品"
      ],
      "englishForms": [
        "damaged items"
      ],
      "en": "I attached a photo of the damaged item to my message.",
      "zh": "我在消息中附上了受损商品的照片。",
      "references": [
        "https://www.target.com/help/articles/returns-exchanges/returns"
      ]
    },
    {
      "term": "send a replacement",
      "partOfSpeech": "verb phrase",
      "meaning": "① 补发替换商品；寄出另一件来替代原来缺失、损坏或不合适的商品。是否收费要看具体约定。",
      "chineseAliases": [
        "补发商品",
        "补发替换商品",
        "寄出替换商品"
      ],
      "englishForms": [
        "sent a replacement",
        "sending a replacement",
        "sends a replacement"
      ],
      "en": "The shop sent a replacement after the first lamp arrived broken.",
      "zh": "第一盏灯送到时已经破损，店家随后补发了一盏。",
      "references": [
        "https://www.target.com/help/articles/returns-exchanges/returns"
      ]
    },
    {
      "term": "missing parts",
      "partOfSpeech": "noun phrase",
      "meaning": "① 缺少的部件或配件；本例指应随产品提供、实际却没有收到的零件。",
      "chineseAliases": [
        "缺少配件",
        "缺少零件",
        "少了配件"
      ],
      "englishForms": [
        "missing part"
      ],
      "en": "We could not assemble the shelf because of the missing parts.",
      "zh": "因为缺少零件，我们没能把架子组装起来。",
      "references": [
        "https://www.target.com/help/articles/returns-exchanges/returns"
      ]
    },
    {
      "term": "price match",
      "partOfSpeech": "noun phrase",
      "meaning": "① 价格匹配；商家按规定把同款商品价格调整到符合条件的较低价格。是否适用及比较对象由具体政策决定。",
      "chineseAliases": [
        "价格匹配",
        "同款价格匹配"
      ],
      "englishForms": [
        "price matches"
      ],
      "en": "I asked whether the store offered a price match for the identical lamp.",
      "zh": "我询问这家店是否对那款完全相同的灯提供价格匹配。",
      "references": [
        "https://www.target.com/help/articles/policies-guidelines/price-match-guarantee?redirect=true"
      ]
    },
    {
      "term": "price protection",
      "partOfSpeech": "noun phrase",
      "meaning": "① 购物保价；购买后在规定条件内降价时，可按政策申请退还差价等调整。不是保证价格永远不变。",
      "chineseAliases": [
        "价格保护",
        "购物保价",
        "商品保价"
      ],
      "englishForms": [],
      "en": "The receipt explained how long the price protection lasted.",
      "zh": "收据说明了保价期持续多久。",
      "references": [
        "https://www.ikea.com/us/en/ikea-family/",
        "https://www.apple.com/shop/help/payments"
      ]
    },
    {
      "term": "member price",
      "partOfSpeech": "noun phrase",
      "meaning": "① 会员价；符合会员条件的人购买指定商品或服务时可享受的价格。",
      "chineseAliases": [
        "会员价",
        "会员价格",
        "会员专享价"
      ],
      "englishForms": [
        "member prices"
      ],
      "en": "The member price was shown below the regular price on the label.",
      "zh": "标签上，会员价列在普通价格下方。",
      "references": [
        "https://www.ikea.com/us/en/files/pdf/00/78/0078e0c8/ikea-costa-mesa-local-ikea-family-offers-april-2024.pdf"
      ]
    },
    {
      "term": "minimum spend",
      "partOfSpeech": "noun phrase",
      "meaning": "① 最低消费金额；购买服务或享受某项优惠需要达到的支出门槛。具体要求取决于场所或活动。",
      "chineseAliases": [
        "最低消费",
        "最低消费金额",
        "消费门槛"
      ],
      "englishForms": [],
      "en": "The offer had a minimum spend, so my small order did not qualify.",
      "zh": "这项优惠设有最低消费门槛，因此我的小额订单不符合条件。",
      "references": [
        "https://www.ikea.com/be/en/customer-service/knowledge/articles/7bc11c74-703b-43fe-b1f9-1e79g659gg7d.html"
      ]
    },
    {
      "term": "wish list",
      "partOfSpeech": "noun phrase",
      "meaning": "① 心愿单；记录希望购买或获得的物品的清单，不代表已经下单。",
      "chineseAliases": [
        "心愿单",
        "愿望清单",
        "购物心愿单"
      ],
      "englishForms": [
        "wish lists",
        "wishlist",
        "wishlists"
      ],
      "en": "I saved the backpack to my wish list while I compared the colours.",
      "zh": "比较不同颜色时，我把那个背包存进了心愿单。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/wish-list?topic=wanting-things"
      ]
    },
    {
      "term": "back-in-stock notification",
      "partOfSpeech": "noun phrase",
      "meaning": "① 补货或重新到货提醒；商品恢复供货时发送的通知，不是已购买包裹的送达通知。",
      "chineseAliases": [
        "到货提醒",
        "补货提醒",
        "重新到货提醒"
      ],
      "englishForms": [
        "back-in-stock notifications",
        "back in stock notification",
        "back in stock notifications"
      ],
      "en": "I received a back-in-stock notification for the blue mug.",
      "zh": "我收到了蓝色杯子重新到货的提醒。",
      "references": [
        "https://www.ikea.com/ca/en/customer-service/knowledge/articles/g7f7ff0d-2903-4d89-ggee-b41c7602e011.html"
      ]
    },
    {
      "term": "payment method",
      "partOfSpeech": "noun phrase",
      "meaning": "① 付款方式；支付一笔费用所使用的方式，例如现金、银行卡或电子支付，不专指分期付款。",
      "chineseAliases": [
        "付款方式",
        "支付方式",
        "付款方法"
      ],
      "englishForms": [
        "payment methods"
      ],
      "en": "The checkout page asked me to choose a payment method.",
      "zh": "结账页面让我选择一种付款方式。",
      "references": [
        "https://www.apple.com/shop/help/payments"
      ]
    },
    {
      "term": "card decline",
      "partOfSpeech": "noun phrase",
      "meaning": "① 银行卡交易被拒；银行卡付款未获批准的情况，不等于商家已扣款后退款。",
      "chineseAliases": [
        "银行卡被拒",
        "银行卡支付被拒",
        "银行卡交易被拒"
      ],
      "englishForms": [
        "card declines"
      ],
      "en": "The cashier saw a card decline and asked whether I had another way to pay.",
      "zh": "收银员看到银行卡交易被拒，便问我有没有其他付款方式。",
      "references": [
        "https://docs.stripe.com/declines"
      ]
    },
    {
      "term": "duplicate charge",
      "partOfSpeech": "noun phrase",
      "meaning": "① 重复扣款；同一笔应付费用被收取超过一次，不是两笔正常的不同消费。",
      "chineseAliases": [
        "重复扣款",
        "重复收费",
        "同一笔费用重复扣款"
      ],
      "englishForms": [
        "duplicate charges"
      ],
      "en": "The statement showed a duplicate charge for the same train ticket.",
      "zh": "账单显示，同一张火车票被重复扣款了。",
      "references": [
        "https://www.chase.com/business/support/payments/dispute-chargebacks"
      ]
    },
    {
      "term": "pending transaction",
      "partOfSpeech": "noun phrase",
      "meaning": "① 待处理交易；银行或支付系统尚未最终处理、入账的交易，不表示一定会失败或已完成。",
      "chineseAliases": [
        "待处理交易",
        "待入账交易",
        "尚未入账的交易"
      ],
      "englishForms": [
        "pending transactions"
      ],
      "en": "The hotel payment was still listed as a pending transaction.",
      "zh": "酒店那笔付款仍列为待处理交易。",
      "references": [
        "https://www.chase.com/business/support/banking/online-banking"
      ]
    },
    {
      "term": "unauthorized transaction",
      "partOfSpeech": "noun phrase",
      "meaning": "① 未经授权的交易；本人没有作出或允许的扣款、转账等交易，不是单纯不满意的一次购买。",
      "chineseAliases": [
        "未授权交易",
        "未经授权的交易",
        "未经本人授权的交易"
      ],
      "englishForms": [
        "unauthorized transactions",
        "unauthorised transaction",
        "unauthorised transactions"
      ],
      "en": "She reported an unauthorized transaction that she did not recognize.",
      "zh": "她报告了一笔自己不认识、也未授权的交易。",
      "references": [
        "https://www.consumerfinance.gov/ask-cfpb/how-do-i-get-my-money-back-after-i-discover-an-unauthorized-transaction-or-money-missing-from-my-bank-account-en-1017/"
      ]
    },
    {
      "term": "chargeback",
      "partOfSpeech": "noun",
      "meaning": "① 银行卡争议退单；持卡人对交易提出争议后，由发卡机构通过支付网络撤回款项的处理。不同于商家主动退款，也不泛指拒绝付款。",
      "chineseAliases": [
        "银行卡争议退单",
        "银行卡交易拒付",
        "信用卡交易拒付",
        "争议退单"
      ],
      "englishForms": [
        "chargebacks"
      ],
      "en": "The bank notified the shop of a chargeback linked to a disputed purchase.",
      "zh": "银行通知店家，有一笔争议购买引发了退单。",
      "references": [
        "https://docs.stripe.com/disputes"
      ]
    },
    {
      "term": "payment reversal",
      "partOfSpeech": "noun phrase",
      "meaning": "① 支付撤销或款项冲回；把先前的付款撤回，或解除相关资金占用的处理。具体机制可能不同，不能一概当作商家退款或银行卡争议退单。",
      "chineseAliases": [
        "撤销扣款",
        "扣款撤销",
        "支付撤销",
        "付款冲回"
      ],
      "englishForms": [
        "payment reversals"
      ],
      "en": "The statement showed a payment reversal after the order was cancelled.",
      "zh": "订单取消后，账单显示了一笔付款冲回。",
      "references": [
        "https://stripe.com/resources/more/payment-reversals-101-types-and-how-to-prevent-them?__from__=talkingdev"
      ]
    },
    {
      "term": "proof of payment",
      "partOfSpeech": "noun phrase",
      "meaning": "① 付款凭证；能证明某笔费用已经支付的记录或文件，不一定与发票或购买商品的明细相同。",
      "chineseAliases": [
        "付款凭证",
        "支付凭证",
        "付款证明"
      ],
      "englishForms": [],
      "en": "The booking office accepted the bank receipt as proof of payment.",
      "zh": "预订处接受了那张银行收据作为付款凭证。",
      "references": [
        "https://www.w3.org/2013/10/payments/slides/session5_raggett.pdf"
      ]
    },
    {
      "term": "transaction history",
      "partOfSpeech": "noun phrase",
      "meaning": "① 交易记录；按时间保存的付款、转账或其他账户交易资料。",
      "chineseAliases": [
        "交易记录",
        "交易历史",
        "账户交易记录"
      ],
      "englishForms": [
        "transaction histories"
      ],
      "en": "I found last month's bookstore payment in the transaction history.",
      "zh": "我在交易记录里找到了上个月在书店的那笔付款。",
      "references": [
        "https://www.americanexpress.com/us/customer-service/faq.gift-card-balance-transaction-history.html"
      ]
    },
    {
      "term": "insufficient funds",
      "partOfSpeech": "noun phrase",
      "meaning": "① 资金或可用余额不足；账户内可用于该笔付款的资金不够，不是密码错误。",
      "chineseAliases": [
        "余额不足",
        "资金不足",
        "可用余额不足"
      ],
      "englishForms": [],
      "en": "The payment failed with an insufficient funds message.",
      "zh": "付款失败了，提示信息显示余额不足。",
      "references": [
        "https://docs.stripe.com/declines/codes"
      ]
    },
    {
      "term": "payment limit",
      "partOfSpeech": "noun phrase",
      "meaning": "① 支付限额；系统、账户或服务对单笔或某段时间内付款金额设定的上限，不是必须支付的最低金额。",
      "chineseAliases": [
        "支付限额",
        "付款限额",
        "支付金额上限"
      ],
      "englishForms": [
        "payment limits"
      ],
      "en": "The app showed a daily payment limit on the account page.",
      "zh": "应用在账户页面显示了每日支付限额。",
      "references": [
        "https://www.chase.com/content/dam/chase-ux/documents/commercial-banking/chase-connect/cc_quickguide_cashflow360_receivables.pdf"
      ]
    },
    {
      "term": "service fee",
      "partOfSpeech": "noun phrase",
      "meaning": "① 服务费；为提供服务或办理某项手续收取的费用。具体场景可译作手续费，不是会员会费。",
      "chineseAliases": [
        "手续费",
        "办理手续费",
        "服务手续费"
      ],
      "englishForms": [
        "service fees"
      ],
      "en": "A service fee was added to the ticket price at checkout.",
      "zh": "结账时，票价之外加收了一笔手续费。",
      "references": [
        "https://www.apple.com/shop/help/payments"
      ]
    },
    {
      "term": "forgot password",
      "partOfSpeech": "expression",
      "meaning": "① 忘记密码；登录界面常用的提示或找回密码入口文字。表示不记得密码，不表示密码已经重置。",
      "chineseAliases": [
        "忘记密码",
        "忘了密码",
        "密码忘了"
      ],
      "englishForms": [],
      "en": "I selected Forgot password when I could not remember my login details.",
      "zh": "想不起登录资料时，我选择了“忘记密码”。",
      "references": [
        "https://support.google.com/accounts/answer/7682439?hl=en"
      ]
    },
    {
      "term": "reset a password",
      "partOfSpeech": "verb phrase",
      "meaning": "① 重置密码；通过相应流程重新设置账户密码，不是仅输入原密码登录。",
      "chineseAliases": [
        "重置密码",
        "重新设置密码",
        "密码重置"
      ],
      "englishForms": [
        "resetting a password",
        "resets a password"
      ],
      "en": "The instructions explained how to reset a password after confirming the email address.",
      "zh": "说明介绍了确认邮箱地址后如何重置密码。",
      "references": [
        "https://support.google.com/accounts/answer/41078?hl=en"
      ]
    },
    {
      "term": "stay signed in",
      "partOfSpeech": "verb phrase",
      "meaning": "① 保持登录状态；再次使用时仍处于已登录的会话中，不表示退出或注销账户。",
      "chineseAliases": [
        "保持登录",
        "保持登入",
        "保持登录状态"
      ],
      "englishForms": [
        "staying signed in",
        "stays signed in"
      ],
      "en": "I chose to stay signed in on my own laptop.",
      "zh": "我在自己的笔记本电脑上选择了保持登录。",
      "references": [
        "https://support.google.com/accounts/answer/54490?hl=en-Gen"
      ]
    },
    {
      "term": "sign out",
      "partOfSpeech": "phrasal verb",
      "meaning": "① 退出登录；结束当前账户会话，不等于删除或永久注销账户。",
      "chineseAliases": [
        "退出登录",
        "退出登入",
        "登出"
      ],
      "englishForms": [
        "signed out",
        "signing out",
        "signs out"
      ],
      "en": "Maya signed out before returning the borrowed tablet.",
      "zh": "玛雅归还借来的平板电脑前退出了登录。",
      "references": [
        "https://support.google.com/accounts/answer/54490?hl=en-Gen"
      ]
    },
    {
      "term": "delete an account",
      "partOfSpeech": "verb phrase",
      "meaning": "① 删除或注销网络账户；使该账户不再作为正常账户使用，不只是退出当前登录会话。",
      "chineseAliases": [
        "注销账号",
        "注销账户",
        "删除账户",
        "删除账号"
      ],
      "englishForms": [
        "deleted an account",
        "deleting an account",
        "deletes an account"
      ],
      "en": "He checked the saved files before choosing to delete an account he no longer used.",
      "zh": "决定删除一个不再使用的账户前，他检查了已保存的文件。",
      "references": [
        "https://support.google.com/accounts/answer/32046?hl=en"
      ]
    },
    {
      "term": "create an account",
      "partOfSpeech": "verb phrase",
      "meaning": "① 创建或注册一个账户；为首次使用建立账户，不等同于登录已有账户。",
      "chineseAliases": [
        "注册账号",
        "注册账户",
        "创建账号",
        "创建账户"
      ],
      "englishForms": [
        "created an account",
        "creating an account",
        "creates an account"
      ],
      "en": "You can create an account with the email address you already use.",
      "zh": "你可以用自己现有的邮箱地址创建一个账户。",
      "references": [
        "https://support.google.com/accounts/answer/27441?hl=en"
      ]
    },
    {
      "term": "locked account",
      "partOfSpeech": "noun phrase",
      "meaning": "① 被系统锁定、暂时不能正常登录或使用的账户；不表示账户一定已经被盗。",
      "chineseAliases": [
        "账户被锁定",
        "账号被锁定",
        "锁定的账户"
      ],
      "englishForms": [
        "locked accounts"
      ],
      "en": "The screen displayed a message about a locked account.",
      "zh": "屏幕显示了一条关于账户被锁定的提示。",
      "references": [
        "https://support.microsoft.com/en-us/accounts-billing/manage/microsoft-account-has-been-locked"
      ]
    },
    {
      "term": "compromised account",
      "partOfSpeech": "noun phrase",
      "meaning": "① 遭到未经授权访问或控制的账户；日常可说账户被盗，不只是自己忘记了密码。",
      "chineseAliases": [
        "账户被盗",
        "账号被盗",
        "账户遭入侵",
        "被盗账户"
      ],
      "englishForms": [
        "compromised accounts"
      ],
      "en": "Messages sent from the compromised account confused her friends.",
      "zh": "从那个被盗账户发出的消息让她的朋友们感到困惑。",
      "references": [
        "https://support.google.com/accounts/answer/6294825?hl=en"
      ]
    },
    {
      "term": "two-step verification",
      "partOfSpeech": "noun phrase",
      "meaning": "① 两步验证；登录时通过两个步骤核验身份，常在密码之外再确认一次。不是把同一密码输入两遍。",
      "chineseAliases": [
        "两步验证",
        "两步身份验证",
        "二步验证"
      ],
      "englishForms": [
        "two step verification",
        "2-step verification"
      ],
      "en": "After I enabled two-step verification, signing in required an extra identity check.",
      "zh": "启用两步验证后，我登录时还需要再核验一次身份。",
      "references": [
        "https://support.google.com/accounts/answer/185839?hl=en"
      ]
    },
    {
      "term": "privacy settings",
      "partOfSpeech": "noun phrase",
      "meaning": "① 隐私设置；控制个人信息、活动资料等如何被显示、使用或分享的选项，不是单纯更换密码。",
      "chineseAliases": [
        "隐私设置",
        "账户隐私设置",
        "隐私选项"
      ],
      "englishForms": [],
      "en": "She changed her privacy settings so only friends could see her photos.",
      "zh": "她修改了隐私设置，让只有朋友才能看到自己的照片。",
      "references": [
        "https://support.microsoft.com/en-us/accessibility/microsoft-account/use-a-screen-reader-to-manage-ad-settings-in-your-microsoft-account"
      ]
    },
    {
      "term": "notification settings",
      "partOfSpeech": "noun phrase",
      "meaning": "① 通知设置；选择是否接收提醒，以及提醒的渠道、声音等的选项。",
      "chineseAliases": [
        "通知设置",
        "提醒设置",
        "通知选项"
      ],
      "englishForms": [],
      "en": "I changed the notification settings to stop the app from playing sounds.",
      "zh": "我修改了通知设置，让应用不再播放提示音。",
      "references": [
        "https://support.google.com/a/users/answer/9308767?hl=en"
      ]
    },
    {
      "term": "email verification",
      "partOfSpeech": "noun phrase",
      "meaning": "① 邮箱验证；通过邮件链接、验证码等确认能使用某个邮箱地址，不是检查邮箱里是否有新邮件。",
      "chineseAliases": [
        "邮箱验证",
        "电子邮箱验证",
        "邮件地址验证"
      ],
      "englishForms": [],
      "en": "Email verification was the last step in setting up the new account.",
      "zh": "验证邮箱是创建这个新账户的最后一步。",
      "references": [
        "https://support.google.com/accounts/answer/27441?hl=en"
      ]
    },
    {
      "term": "recover an account",
      "partOfSpeech": "verb phrase",
      "meaning": "① 找回账户；恢复对原账户的访问，不表示另注册一个新账户或找回账户内的所有文件。",
      "chineseAliases": [
        "恢复账户",
        "找回账户",
        "找回账号",
        "恢复账号"
      ],
      "englishForms": [
        "recovered an account",
        "recovering an account",
        "recovers an account"
      ],
      "en": "The recovery form helped her recover an account she had not used for years.",
      "zh": "找回表格帮助她重新访问了一个多年未用的账户。",
      "references": [
        "https://support.google.com/accounts/answer/7682439?hl=en"
      ]
    },
    {
      "term": "parcel locker",
      "partOfSpeech": "noun phrase",
      "meaning": "① 快递柜；供存放和领取包裹的专用柜格或柜组，常供收件人自助取件，不是普通行李寄存柜。",
      "chineseAliases": [
        "快递柜",
        "包裹柜",
        "自助取件柜"
      ],
      "englishForms": [
        "parcel lockers"
      ],
      "en": "The message said my package was in a parcel locker near the entrance.",
      "zh": "消息说，我的包裹放在入口附近的快递柜里。",
      "references": [
        "https://faq.usps.com/articles/FAQ/gopost-Package-Pickup"
      ]
    },
    {
      "term": "remaining balance",
      "partOfSpeech": "noun phrase",
      "meaning": "① 剩余余额；账户或礼品卡中尚余的金额。本例指礼品卡的余额，不是贷款未偿还的金额。",
      "chineseAliases": [
        "剩余余额",
        "剩余账户余额",
        "礼品卡剩余余额"
      ],
      "englishForms": [
        "remaining balances"
      ],
      "en": "After buying the notebook, I checked the remaining balance on my gift card.",
      "zh": "买完笔记本后，我查看了礼品卡的剩余余额。",
      "references": [
        "https://www.americanexpress.com/us/customer-service/faq.gift-card-balance-transaction-history.html"
      ]
    },
    {
      "term": "schedule a parcel pickup",
      "partOfSpeech": "verb phrase",
      "meaning": "① 预约快递取件；与承运方约定来收取待寄包裹的时间，不是预约自己到店领取订单。",
      "chineseAliases": [
        "预约取件",
        "预约快递取件",
        "预约上门取件"
      ],
      "englishForms": [
        "scheduled a parcel pickup",
        "scheduling a parcel pickup",
        "schedules a parcel pickup",
        "schedule a package pickup"
      ],
      "en": "I scheduled a parcel pickup for the box I needed to return.",
      "zh": "我为那个需要退回的箱子预约了快递取件。",
      "references": [
        "https://tools.usps.com/schedule-pickup-steps.htm"
      ]
    },
    {
      "term": "sorry to bother you",
      "partOfSpeech": "expression",
      "meaning": "① 不好意思打扰了；提出请求、问问题或打断别人时使用的礼貌开场语。",
      "chineseAliases": [
        "不好意思打扰了",
        "不好意思打扰你",
        "抱歉打扰你"
      ],
      "englishForms": [
        "I'm sorry to bother you",
        "I am sorry to bother you"
      ],
      "en": "Sorry to bother you, but is this seat free?",
      "zh": "不好意思打扰了，这个位子有人坐吗？",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/sorry-to-bother-you?topic=making-and-accepting-apologies"
      ]
    },
    {
      "term": "is now a good time to talk",
      "partOfSpeech": "expression",
      "meaning": "① 现在方便聊一下吗？先询问对方目前是否方便交谈，不是约定稍后一定要聊。",
      "chineseAliases": [
        "方便聊一下吗",
        "现在方便聊一下吗",
        "现在方便说话吗"
      ],
      "englishForms": [],
      "en": "Is now a good time to talk, or should I call after your meeting?",
      "zh": "现在方便聊一下吗，还是等你开完会我再打来？",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/sorry-to-bother-you?topic=making-and-accepting-apologies"
      ]
    },
    {
      "term": "I might be a little late",
      "partOfSpeech": "expression",
      "meaning": "① 我可能会晚一点到；表示有迟到的可能，还没有断定一定迟到。",
      "chineseAliases": [
        "我可能会晚一点到",
        "我可能会迟到一会儿",
        "我可能晚点到"
      ],
      "englishForms": [],
      "en": "I might be a little late if the traffic stays this heavy.",
      "zh": "如果交通一直这么拥堵，我可能会晚一点到。",
      "references": [
        "https://dictionary.cambridge.org/us/grammar/british-grammar/might"
      ]
    },
    {
      "term": "I'm almost there",
      "partOfSpeech": "expression",
      "meaning": "① 我快到了；在路上说明离目的地已经很近。本例说的是到达地点，不是任务快完成了。",
      "chineseAliases": [
        "我快到了",
        "我马上就到了",
        "快到目的地了"
      ],
      "englishForms": [
        "I am almost there"
      ],
      "en": "I'm almost there; I can see the café across the road.",
      "zh": "我快到了，已经能看到马路对面的咖啡馆了。",
      "references": [
        "https://learnenglish.britishcouncil.org/sites/podcasts/files/LearnEnglish-Writing-A1-A-message-to-say-youre-late.pdf"
      ]
    },
    {
      "term": "I'll let you get back to it",
      "partOfSpeech": "expression",
      "meaning": "① 你先忙；结束打扰，让对方继续刚才的事情，语气通常体贴而非催促。",
      "chineseAliases": [
        "你先忙",
        "你先继续忙",
        "那你先忙"
      ],
      "englishForms": [
        "I will let you get back to it"
      ],
      "en": "You look busy, so I'll let you get back to it.",
      "zh": "你看起来很忙，那我就不打扰了，你先忙。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/sorry-to-bother-you?topic=making-and-accepting-apologies"
      ]
    },
    {
      "term": "let's make it another time",
      "partOfSpeech": "expression",
      "meaning": "① 改天吧；建议把约好的活动或见面改到另一个时间，尚未确定具体日期。",
      "chineseAliases": [
        "改天吧",
        "改天再约",
        "我们改天再约"
      ],
      "englishForms": [
        "let us make it another time"
      ],
      "en": "I can't come on Friday, so let's make it another time.",
      "zh": "我星期五来不了，我们改天再约吧。",
      "references": []
    },
    {
      "term": "it's all right",
      "partOfSpeech": "expression",
      "meaning": "① 没关系；回应道歉时表示自己并不介意。本例不是说某事与自己毫无关联。",
      "chineseAliases": [
        "没关系",
        "没事的",
        "这没关系"
      ],
      "englishForms": [
        "it is all right",
        "that's all right",
        "that is all right"
      ],
      "en": "It's all right—you only kept me waiting for a minute.",
      "zh": "没关系，你只让我等了一分钟。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/all-right"
      ]
    },
    {
      "term": "you're welcome",
      "partOfSpeech": "expression",
      "meaning": "① 不用客气；回答别人感谢的话，不是指欢迎别人进入某地。",
      "chineseAliases": [
        "不用客气",
        "不客气",
        "不用谢",
        "别客气"
      ],
      "englishForms": [
        "you are welcome"
      ],
      "en": "You're welcome; I'm glad the notes helped you.",
      "zh": "不用客气，很高兴那些笔记帮到了你。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/you-re-welcome"
      ]
    },
    {
      "term": "thanks for your help",
      "partOfSpeech": "expression",
      "meaning": "① 谢谢帮忙；在致谢语境中也可表达“麻烦你了”。这是感谢帮助，不是直接要求别人答应一个请求。",
      "chineseAliases": [
        "麻烦你了",
        "谢谢帮忙",
        "谢谢你的帮助"
      ],
      "englishForms": [
        "thank you for your help"
      ],
      "en": "Thanks for your help; we finished packing before the taxi arrived.",
      "zh": "谢谢帮忙，我们在出租车到来前把东西收拾好了。",
      "references": [
        "https://downloads.bbc.co.uk/worldservice/learningenglish/howto/how_to_080528_ask_favour.pdf"
      ]
    },
    {
      "term": "sorry to keep you waiting",
      "partOfSpeech": "expression",
      "meaning": "① 让你久等了，抱歉；对别人因自己而等待表示歉意，不是命令对方继续等。",
      "chineseAliases": [
        "让你久等了",
        "抱歉让你久等了",
        "不好意思让你久等"
      ],
      "englishForms": [
        "I'm sorry to keep you waiting",
        "I am sorry to keep you waiting"
      ],
      "en": "Sorry to keep you waiting; the printer stopped working.",
      "zh": "抱歉让你久等了，打印机刚才出故障了。",
      "references": [
        "https://learnenglish.britishcouncil.org/sites/podcasts/files/LearnEnglish-Writing-A1-A-message-to-say-youre-late.pdf"
      ]
    },
    {
      "term": "I didn't mean to",
      "partOfSpeech": "expression",
      "meaning": "① 我不是故意的；否认有意做刚才那件事，可接动词说明具体行为。不是说没有理解词义。",
      "chineseAliases": [
        "我不是故意的",
        "我不是有意的",
        "我无意这样做"
      ],
      "englishForms": [
        "I did not mean to"
      ],
      "en": "I didn't mean to wake you; the door slipped out of my hand.",
      "zh": "我不是故意吵醒你的，门从我手里滑脱了。",
      "references": [
        "https://dictionary.cambridge.org/grammar/british-grammar/mean"
      ]
    },
    {
      "term": "I've changed my mind",
      "partOfSpeech": "expression",
      "meaning": "① 我改变主意了；已经作出了与之前不同的决定，不是仍在犹豫。",
      "chineseAliases": [
        "我改变主意了",
        "我改主意了",
        "我已经改变主意了"
      ],
      "englishForms": [
        "I have changed my mind",
        "I changed my mind"
      ],
      "en": "I've changed my mind; I'd rather take the train than drive.",
      "zh": "我改变主意了，比起开车，我更愿意坐火车。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/change-mind"
      ]
    },
    {
      "term": "you're right",
      "partOfSpeech": "expression",
      "meaning": "① 你说得对；认可对方刚才的判断或意见，不是在指示向右转。",
      "chineseAliases": [
        "你说得对",
        "你说的对",
        "你是对的"
      ],
      "englishForms": [
        "you are right"
      ],
      "en": "You're right—the library closes earlier on Sundays.",
      "zh": "你说得对，图书馆星期天确实关门更早。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/right"
      ]
    },
    {
      "term": "I'm not sure",
      "partOfSpeech": "expression",
      "meaning": "① 我不确定；目前不能肯定某个事实或决定，不必然表示反对。",
      "chineseAliases": [
        "我不确定",
        "我还不确定",
        "我不能肯定"
      ],
      "englishForms": [
        "I am not sure"
      ],
      "en": "I'm not sure which entrance is open after six.",
      "zh": "我不确定六点以后哪个入口还开着。",
      "references": []
    },
    {
      "term": "I'll think about it",
      "partOfSpeech": "expression",
      "meaning": "① 我再考虑一下；暂不作决定，有时是委婉推迟答复，不等于已经答应。",
      "chineseAliases": [
        "我再考虑一下",
        "我考虑考虑",
        "我会考虑一下"
      ],
      "englishForms": [
        "I will think about it"
      ],
      "en": "I'll think about it and let you know tomorrow.",
      "zh": "我再考虑一下，明天告诉你。",
      "references": [
        "https://www.oxfordlearnersdictionaries.com/definition/english/think-of"
      ]
    },
    {
      "term": "sounds good",
      "partOfSpeech": "expression",
      "meaning": "① 听起来不错；对建议或安排表示赞同。本例不是评价某段声音好听。",
      "chineseAliases": [
        "听起来不错",
        "这个主意听着不错",
        "这个安排不错"
      ],
      "englishForms": [
        "that sounds good",
        "it sounds good"
      ],
      "en": "Sounds good—let’s meet outside the bookshop at four.",
      "zh": "听起来不错，我们四点在书店外见吧。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/sound"
      ]
    },
    {
      "term": "I'll take care of it",
      "partOfSpeech": "expression",
      "meaning": "① 我来处理；表示愿意负责把这件事办好，不是说已经处理完毕。",
      "chineseAliases": [
        "我来处理",
        "这事我来办",
        "交给我处理"
      ],
      "englishForms": [
        "I will take care of it"
      ],
      "en": "Leave the room booking with me; I'll take care of it.",
      "zh": "订会议室的事交给我，我来处理。",
      "references": [
        "https://www.wordsmyth.net/?as_level=3&rid=48219"
      ]
    },
    {
      "term": "let me carry that for you",
      "partOfSpeech": "expression",
      "meaning": "① 我帮你拿吧；主动提出替对方拿或搬眼前的东西，不是要求对方替自己拿。",
      "chineseAliases": [
        "我帮你拿吧",
        "让我帮你拿",
        "我帮你搬吧"
      ],
      "englishForms": [],
      "en": "Let me carry that for you while you unlock the door.",
      "zh": "你开门的时候，我帮你拿那个东西吧。",
      "references": [
        "https://downloads.bbc.co.uk/worldservice/learningenglish/howto/how_to_080528_ask_favour.pdf"
      ]
    },
    {
      "term": "it's up to you",
      "partOfSpeech": "expression",
      "meaning": "① 由你决定；在给予对方选择权的语境中可说“随便你”。语气不同也可能显得不耐烦，不等于我完全不关心。",
      "chineseAliases": [
        "随便你",
        "由你决定",
        "你自己决定"
      ],
      "englishForms": [
        "it is up to you"
      ],
      "en": "We can walk or take the bus; it's up to you.",
      "zh": "我们可以步行，也可以坐公交车，由你决定。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/learner-english/up"
      ]
    },
    {
      "term": "at your convenience",
      "partOfSpeech": "prepositional phrase",
      "meaning": "① 在你方便的时候；由对方选择合适的时间，不表示要求立刻处理。",
      "chineseAliases": [
        "按你方便的时间",
        "在你方便时",
        "你方便的时候"
      ],
      "englishForms": [],
      "en": "We can review the photographs at your convenience next week.",
      "zh": "我们下周可以在你方便时一起看那些照片。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/at-convenience?q=at-your-convenience"
      ]
    },
    {
      "term": "thanks in advance",
      "partOfSpeech": "expression",
      "meaning": "① 提前谢谢你；提出请求后预先表达感谢，不表示对方已经答应或完成了帮助。",
      "chineseAliases": [
        "提前谢谢你",
        "先谢谢你",
        "预先感谢"
      ],
      "englishForms": [
        "thank you in advance"
      ],
      "en": "Could you check the room number for me? Thanks in advance.",
      "zh": "能帮我核对一下房间号吗？先谢谢你。",
      "references": [
        "https://downloads.bbc.co.uk/worldservice/learningenglish/howto/how_to_080528_ask_favour.pdf"
      ]
    },
    {
      "term": "don't take it to heart",
      "partOfSpeech": "expression",
      "meaning": "① 别放在心上；劝人不要因批评、玩笑等过分难过或耿耿于怀，不是让人忘掉所有重要建议。",
      "chineseAliases": [
        "别放在心上",
        "不要往心里去",
        "别太往心里去"
      ],
      "englishForms": [
        "do not take it to heart"
      ],
      "en": "Don't take it to heart; her comment was about the timetable, not your work.",
      "zh": "别太往心里去，她评论的是时间安排，不是你的工作。",
      "references": [
        "https://dictionary.cambridge.org/us/dictionary/english/take-to-heart?topic=continually-thinking-about"
      ]
    },
    {
      "term": "I owe you one",
      "partOfSpeech": "idiom",
      "meaning": "① 我欠你个人情；感谢对方帮忙，并表示以后愿意回报，不是具体欠一元钱。",
      "chineseAliases": [
        "我欠你个人情",
        "欠你一个人情",
        "我欠你一个人情"
      ],
      "englishForms": [],
      "en": "You stayed to help with the boxes—I owe you one.",
      "zh": "你留下来帮我搬箱子，这个人情我记下了。",
      "references": [
        "https://downloads.bbc.co.uk/worldservice/learningenglish/howto/how_to_080528_ask_favour.pdf"
      ]
    },
    {
      "term": "let's leave it for another time",
      "partOfSpeech": "expression",
      "meaning": "① 下次再说；建议把眼前的话题或事情留到另一次再谈、再处理，不保证已约定新时间。",
      "chineseAliases": [
        "下次再说",
        "留到下次再说",
        "改日再讨论"
      ],
      "englishForms": [
        "let us leave it for another time"
      ],
      "en": "We're both tired; let's leave it for another time.",
      "zh": "我们都累了，这件事下次再说吧。",
      "references": []
    },
    {
      "term": "something came up",
      "partOfSpeech": "expression",
      "meaning": "① 临时有事；发生了未预料的事情，常用来解释为什么需要改变计划，不一定是严重事故。",
      "chineseAliases": [
        "临时有事",
        "突然有事",
        "临时出了点事"
      ],
      "englishForms": [
        "something has come up"
      ],
      "en": "I was going to join you for lunch, but something came up.",
      "zh": "我本来打算和你一起吃午饭，但临时有点事。",
      "references": [
        "https://dictionary.cambridge.org/dictionary/english/up?topic=functioning"
      ]
    },
    {
      "term": "cancel plans",
      "partOfSpeech": "verb phrase",
      "meaning": "① 取消原定安排；决定不进行之前计划好的活动，不只是把活动推迟到另一天。",
      "chineseAliases": [
        "取消计划",
        "取消原定安排",
        "取消原计划"
      ],
      "englishForms": [
        "cancelled plans",
        "canceled plans",
        "cancelling plans",
        "canceling plans",
        "cancels plans"
      ],
      "en": "We cancelled our plans for a picnic when the storm arrived.",
      "zh": "暴风雨来临后，我们取消了原定的野餐安排。",
      "references": [
        "https://www.dictionary.com/browse/cancel"
      ]
    },
    {
      "term": "I'm free",
      "partOfSpeech": "expression",
      "meaning": "① 我有空；在约时间的语境中表示自己没有其他安排，不是说自己免费或刚获自由。",
      "chineseAliases": [
        "我有空",
        "我有时间",
        "我现在有空"
      ],
      "englishForms": [
        "I am free"
      ],
      "en": "I'm free after four, but I have to leave by six.",
      "zh": "我四点以后有空，但六点前得走。",
      "references": [
        "https://www.collinsdictionary.com/us/dictionary/english/free"
      ]
    },
    {
      "term": "are you free",
      "partOfSpeech": "expression",
      "meaning": "① 你有空吗？询问对方某个时间是否有空，不是在询问价格是否免费。",
      "chineseAliases": [
        "你有空吗",
        "你有没有空",
        "你有时间吗"
      ],
      "englishForms": [],
      "en": "Are you free on Saturday morning to help me choose a desk?",
      "zh": "你星期六早上有空帮我挑一张书桌吗？",
      "references": [
        "https://www.collinsdictionary.com/us/dictionary/english/free"
      ]
    },
    {
      "term": "don't worry",
      "partOfSpeech": "expression",
      "meaning": "① 别担心；劝人放宽心，不是保证任何情况下都不会发生问题。",
      "chineseAliases": [
        "别担心",
        "不要担心",
        "不用担心"
      ],
      "englishForms": [
        "do not worry"
      ],
      "en": "Don't worry about the rain; we can wait inside the café.",
      "zh": "别担心下雨，我们可以在咖啡馆里等。",
      "references": [
        "https://learnenglish.britishcouncil.org/sites/podcasts/files/LearnEnglish-Writing-A1-A-message-to-say-youre-late.pdf"
      ]
    },
    {
      "term": "be denied a refund",
      "partOfSpeech": "passive verb phrase",
      "meaning": "① 未获准退款；退款申请被拒。说明申请退款的人未获准退款，不表示这个人拒绝给别人退款。",
      "chineseAliases": [
        "退款被拒",
        "退款申请被拒",
        "未获准退款"
      ],
      "englishForms": [
        "was denied a refund",
        "were denied a refund",
        "is denied a refund",
        "been denied a refund",
        "being denied a refund"
      ],
      "en": "I was denied a refund, but the store offered me an exchange.",
      "zh": "我的退款申请被拒了，不过店家提出可以换货。",
      "references": [
        "https://www.target.com/help/article/000061980"
      ]
    },
  ...REVIEWED_SENSE_ENTRIES,
].map((entry) => Object.freeze({
  ...entry,
  chineseAliases: Object.freeze(entry.chineseAliases),
  englishForms: Object.freeze(entry.englishForms),
  references: Object.freeze(entry.references),
})));
