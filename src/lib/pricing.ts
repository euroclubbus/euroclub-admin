// Кеп (06.10): копія ядра ціноутворення застосунку (euroclub-app/src/pricing.ts) — тільки
// те, що потрібно для бронювання в одну сторону з Support Center. Логіка ідентична, щоб
// ціни в чаті збігалися з застосунком. Зміни в застосунку — переносити й сюди.
export const MOB_MAX_PCT = 40;
export const LEGACY_SALE_50_ID = 45;
export function mobDiscountId(pct: number): number | null {
  const p = Math.round(Number(pct) || 0);
  if (p <= 0) return null;
  if (p >= 50) return LEGACY_SALE_50_ID;
  return 100 + Math.min(p, MOB_MAX_PCT);
}
export function mobEffectivePct(pct: number): number {
  const p = Math.round(Number(pct) || 0);
  if (p <= 0) return 0;
  if (p >= 50) return 50;
  return Math.min(p, MOB_MAX_PCT);
}
export function computeLegPricing(trip: any) {
  const priceOld = Number(trip?.price_old ?? trip?.price ?? 0);
  const priceAlt = Number(trip?.price_alt ?? 0);
  const priceDsc = Number(trip?.price_dsc ?? 0);
  const priceMobDsc = Number(trip?.price_mob_dsc ?? 0);
  const base = priceAlt !== 0 ? priceAlt : priceOld;
  const pct = mobEffectivePct(priceMobDsc > 0 ? priceMobDsc : priceDsc > 0 ? priceDsc : 0);
  return { base, pct, actual: Math.round(base * (1 - pct / 100)), discountId: mobDiscountId(pct) };
}
export function legPriceWithFixedCategory(trip: any, categoryPct: number) {
  const { base, pct, discountId } = computeLegPricing(trip);
  const usedTrip = pct > categoryPct;
  const eff = usedTrip ? pct : categoryPct;
  return { price: Math.round(base * (1 - eff / 100)), usedTrip, discountId: usedTrip ? discountId : null };
}
