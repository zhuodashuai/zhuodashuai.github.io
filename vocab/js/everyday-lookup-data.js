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
      "缺考后的补考"
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
      "老师答疑时间"
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
].map((entry) => Object.freeze({
  ...entry,
  chineseAliases: Object.freeze(entry.chineseAliases),
  englishForms: Object.freeze(entry.englishForms),
  references: Object.freeze(entry.references),
})));
