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
