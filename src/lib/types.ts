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
