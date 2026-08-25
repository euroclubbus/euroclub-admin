// Назви іконок обмежені набором, який вже імпортований у мобільному
// додатку euroclub-app (lucide-react). Якщо звідти додадуть нову іконку,
// онови й цей список.
export const ICON_NAMES = [
  "FileText",
  "Gift",
  "Map",
  "Bus",
  "Star",
  "Share2",
  "Info",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export interface SideMenuItem {
  id: string;
  order: number;
  icon: IconName;
  label: string;
  url: string;
}

export type PushCampaignStatus = "sent" | "partial" | "failed";

export interface PushCampaign {
  id: string;
  title: string;
  body: string;
  deepLink?: string;
  sentAt: number; // epoch ms
  targetCount: number;
  successCount: number;
  status: PushCampaignStatus;
}

// Колекція device_tokens: один документ на користувача, ID документа = uid,
// поле token — поточний FCM-токен пристрою. Панель лише читає й рахує
// кількість документів для розсилки — запис веде мобільний додаток.
export interface DeviceTokenDoc {
  token: string;
  updatedAt?: number;
}

export interface HubBranch {
  cityId: string;
  name: string;
}

export interface RouteCity {
  id: string; // унікальний ідентифікатор запису в межах маршруту (не city id — можна теоретично мати той самий хаб двічі)
  cityId: string;
  name: string;
  arrivalTime: string; // "HH:MM" — час прибуття в це місто, порожньо для першого міста маршруту
  departureTime: string; // "HH:MM" — час відправлення з цього міста, порожньо для останнього
  isHub: boolean; // хаб пересадки — відкриває підменю з гілкою інших міст
  hubBranches: HubBranch[];
}

export interface RouteDoc {
  id: string;
  order: number;
  name: string;
  cities: RouteCity[]; // порядок = порядок слідування, перетягується
  description: string; // стандартний фіксований текстовий блок (без rich-форматування)
}

export interface FeedbackMessage {
  id: string;
  from: "user" | "admin";
  text: string;
  at: number;
}

export interface FeedbackThread {
  id: string; // = userId
  userId: string;
  lastMessageAt: number;
  messages: FeedbackMessage[];
}

// Звіт по поїздці (не PII) — те саме, що пише reportTrip() у мобільному застосунку.
export interface TripReport {
  id: string;
  userId: string;
  orderNo: string;
  ticketNumbers: string[];
  tripDate: string;
  direction: string;
  fromCity?: string;
  toCity?: string;
  passengerCount?: number;
  discountIds?: string[];
  roundTrip?: boolean;
  bookingDate: string;
}

export type BlockType = "image" | "video" | "text";

export interface PageBlock {
  id: string;
  type: BlockType;
  url?: string; // image/video — Storage download URL
  html?: string; // text — rich HTML з редактора
}

export interface SocialLink {
  id: string;
  platform: string;
  url: string;
}

export interface PageDoc {
  id: string; // slug, використовується застосунком для запиту сторінки
  title: string; // назва для панелі (і як заголовок екрана в застосунку)
  blocks: PageBlock[]; // порядок = порядок масиву, перетягується
  socialLinks?: SocialLink[]; // лише для сторінки "Ми в соцмережах" (id: "social")
}

export type EuroClass = "Euro 5" | "Euro 6";

// Каталог знижок — назви й відсотки підтверджені з реальних тестів пікера знижок у
// застосунку (одна база — 5500грн повний тариф, решта — спостережені ціни від неї).
// Якщо прогер колись дасть точний перелік з ID — звірити й підправити.
export const DISCOUNT_CATALOG: { name: string; percent: number }[] = [
  { name: "Повний тариф", percent: 0 },
  { name: "Особи, старші за 60", percent: 10 },
  { name: "Особи з інвалідністю (I-II групи)", percent: 10 },
  { name: "Військовослужбовці з УБД", percent: 20 },
  { name: "Тварина", percent: 20 },
  { name: "Доп. місце", percent: 20 },
  { name: "Діти 1-10 років", percent: 30 },
  { name: "Діти до 1 року", percent: 50 },
];

export interface OrderRegistryPassenger {
  index: number;
  ticketNumber: string;
  discountName: string;
  discountPercent: number;
  tariff: number; // повна ціна квитка (до знижки)
  price: number; // тариф з урахуванням знижки — те, що реально бачить і платить пасажир
}

export interface OrderRegistryEdit {
  at: string; // ISO
  passengerIndex: number;
  field: "discount" | "tariff" | "price" | "status";
  oldValue: string | number;
  newValue: string | number;
}

export interface OrderSurcharge {
  amount: number;
  reason: string; // "Зміна дати" | "Зміна місця відправлення" | "Зміна пасажира" | довільний текст
  at: string; // ISO
}

export interface OrderRegistryDoc {
  orderNo: string; // = id документа
  userEmail?: string; // для аналітики — скільки замовлень цього юзера прийшло через застосунок
  userId?: string; // = device_tokens/{userId} — для адресної розсилки сповіщення по цьому замовленню
  backendUserId?: string; // ЖИВЕ поле "user_id" з відповіді бекенду (user-orders) — джерело
  // правди, синхронізується автоматично коли юзер відкриває застосунок; працює навіть для
  // старих замовлень, зроблених до того, як ми самі почали щось записувати
  appPlatform?: "1" | "2"; // те саме, що йде на бекенд у кожному запиті — 1=Android/PWA, 2=iOS
  backendAppPlatform?: string; // ЖИВЕ поле "app" з відповіді бекенду (user-orders) — джерело
  // правди, синхронізується автоматично, коли юзер відкриває застосунок; працює навіть для
  // старих замовлень, зроблених до того, як ми самі почали щось записувати
  route1: string; // = trip.id.split('-')[0] — id рейсу, дозволяє фільтрувати всі замовлення цього маршруту
  totalOrdersCount?: number; // повна історія юзера (всі канали) на момент цього бронювання —
  // забирається застосунком поки жива сесія юзера, окремого адмін-методу для цього нема
  viaApp?: boolean; // true = нативний Android/iOS застосунок, false = PWA/сайт у браузері —
  // Booking.tsx однаковий для обох, тому без цього поля "з додатку" рахувало б і сайт теж
  fromCity: string;
  toCity: string;
  tripDate: string;
  tripDate2?: string;
  roundTrip: boolean;
  createdAt: string; // ISO
  passengers: OrderRegistryPassenger[];
  editHistory: OrderRegistryEdit[];
  surcharges?: OrderSurcharge[];
  paid?: boolean;
  // Реальний статус/оплата з бекенду — синхронізується автоматично застосунком під час
  // опитування, ніяк не пов'язано з ручним перемикачем "Оплачено" вище.
  backendStatus?: number | string | null; // 0=скасовано, 1=не сплачено, 2=оплачено(попереду), 3=оплачено(завершено)
  backendPaidUah?: number;
  backendPaidEur?: number;
  backendSyncedAt?: string;
}

export interface FleetAmenities {
  climate: boolean; // клімат-контроль
  vip: boolean; // віп-салон
  wifi: boolean;
  toilet: boolean;
  kitchen: boolean; // чай/кава/окріп
}

export const DEFAULT_AMENITIES: FleetAmenities = {
  climate: true,
  vip: true,
  wifi: true,
  toilet: true,
  kitchen: true,
};

export interface FleetBus {
  id: string;
  order: number;
  brandModel: string;
  plateNumber: string;
  floors: 1 | 2;
  seats: number;
  euroClass: EuroClass;
  amenities: FleetAmenities;
  photos: string[]; // Firebase Storage download URL, порядок = порядок показу
  galleryMode: "slider" | "collage";
}

// --- Маркетинг (Meta Ads) ---

export interface MetaAdsCampaign {
  id: string;
  name: string;
  objective: string;
  buyingType?: string;
  optimizationGoal?: string;

  impressions: number;
  reach: number;
  frequency: number;
  spend: number;

  clicks: number;
  uniqueClicks: number;
  inlineLinkClicks: number;

  cpm: number;
  cpc: number;
  cpp: number;
  ctr: number;
  uniqueCtr: number;

  leads: number;
  purchases: number;
  messagingConversations: number;
  actions: { action_type: string; value: string }[];
  actionValues: { action_type: string; value: string }[];
  costPerActionType: { action_type: string; value: string }[];
  conversions: { action_type: string; value: string }[];
  conversionValues: { action_type: string; value: string }[];
  costPerConversion: { action_type: string; value: string }[];

  inlinePostEngagement: number;

  videoPlays: number;
  videoThruplay: number;
  videoP25: number;
  videoP50: number;
  videoP75: number;
  videoP95: number;
  videoP100: number;

  qualityRanking?: string;
  engagementRateRanking?: string;
  conversionRateRanking?: string;
}

// Відповідь /api/meta-ads-report — запитується "on demand" за конкретний
// діапазон дат (не кешується/не синхронізується у фоні).
export interface MetaAdsReportResponse {
  generatedAt: string;
  range: { since: string; until: string };
  account: { id: string; name: string; currency: string };
  campaigns: MetaAdsCampaign[];
}

// Ручні цифри зі звіту підрядчика — по одному документу на кампанію,
// id документа = campaign_id з Meta. Порівнюється з реальними даними API.
export interface ContractorReportEntry {
  id: string; // = campaign_id
  spend?: number;
  leads?: number;
  note?: string;
  updatedAt?: string;
}
