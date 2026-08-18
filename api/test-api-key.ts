import type { VercelRequest, VercelResponse } from "@vercel/node";

// ТЕСТ (Кеп, 17.08): маємо API-ключ, який має дозволяти запити на бекенд НАПРЯМУ по oid,
// без прив'язки до сесії конкретного юзера (на відміну від sessionKey-підходу в
// api/refresh-order.ts, який працює тільки для замовлень, зроблених ПІСЛЯ 11.08 і через
// PWA — Android-застосунок на старій збірці цього поля взагалі не пише).
// Точний формат (opr/куди саме йде ключ) НЕ задокументований — пробуємо найімовірніший
// варіант (ключ замість uidkey, opr=order_info — єдиний відомий нам endpoint, що приймає
// oid напряму) і повертаємо СИРУ відповідь бекенду як є, щоб побачити правду одразу, а не
// гадати далі.

const WORKER = "https://curly-voice-8a71.eclubbus21.workers.dev";
const API_KEY = process.env.BACKEND_API_KEY || "f2d5d4587c51e5f16d7a21ed60650975_";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Метод не підтримується" });
    return;
  }
  const { oid } = req.body ?? {};
  if (typeof oid !== "string" || !oid.trim()) {
    res.status(400).json({ error: "Потрібне поле oid" });
    return;
  }

  const results: any[] = [];

  // Спроба 3 (нова): src/api/euroclub.ts показав, що є ОКРЕМИЙ шлях /v1/json/{method}/,
  // де ключ EUROCLUB_KEY підставляє САМ Worker curly-voice-8a71 автоматично — застосунок
  // взагалі не передає жодного ключа сам. Метод order_confirm приймає hash (=oid) напряму,
  // без uidkey. Пробуємо БЕЗ жодного ключа з нашого боку — якщо Worker сам підставляє.
  try {
    const url = `${WORKER}/v1/json/order_confirm/?hash=${encodeURIComponent(oid)}`;
    const backendRes = await fetch(url, { cache: "no-store" });
    const rawText = await backendRes.text();
    results.push({ label: "order_confirm через curly-voice-8a71 (без ключа з нашого боку)", url, httpStatus: backendRes.status, raw: rawText.slice(0, 2000) });
  } catch (err) {
    results.push({ label: "order_confirm через curly-voice-8a71", error: err instanceof Error ? err.message : String(err) });
  }

  const attempts: { label: string; body: Record<string, string> }[] = [
    { label: "order_info + key як uidkey", body: { work: "work", app: "1", lng: "uk", uidkey: API_KEY, mod: "apimobile", opr: "order_info", oid } },
    { label: "user-orders + key як uidkey + oid", body: { work: "work", app: "1", lng: "uk", uidkey: API_KEY, mod: "apimobile", opr: "user-orders", oid } },
  ];

  for (const attempt of attempts) {
    try {
      const backendRes = await fetch(`${WORKER}/input`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(attempt.body).toString(),
        cache: "no-store",
      });
      const rawText = await backendRes.text();
      results.push({ label: attempt.label, httpStatus: backendRes.status, raw: rawText.slice(0, 2000) });
    } catch (err) {
      results.push({ label: attempt.label, error: err instanceof Error ? err.message : String(err) });
    }
  }

  res.status(200).json({ oid, results });
}
