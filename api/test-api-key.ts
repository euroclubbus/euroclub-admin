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

  // Кеп (18.08) підтвердив ТОЧНИЙ робочий формат для методу routes:
  // eclub.com.ua/api/v1/json/routes/{KEY}/?from=..&to=..  — ключ ЯК ЧАСТИНА URL-ШЛЯХУ,
  // напряму на eclub.com.ua (НЕ через curly-voice-8a71 з нашого боку — той сам вставляє
  // ключ, коли викликаємо БЕЗ нього). Пробуємо той самий шаблон для order_confirm.
  try {
    const url = `https://eclub.com.ua/api/v1/json/order_confirm/${API_KEY}/?hash=${encodeURIComponent(oid)}`;
    const backendRes = await fetch(url, { cache: "no-store" });
    const rawText = await backendRes.text();
    results.push({ label: "order_confirm напряму на eclub.com.ua, ключ у шляху", url, httpStatus: backendRes.status, raw: rawText.slice(0, 2000) });
  } catch (err) {
    results.push({ label: "order_confirm напряму на eclub.com.ua, ключ у шляху", error: err instanceof Error ? err.message : String(err) });
  }

  // Контрольний тест — той самий шаблон, але для routes (Кеп підтвердив що ЦЕ працює) з
  // фіксованими Київ→Берлін, щоб перевірити саму методику виклику (чи взагалі є мережевий
  // доступ з нашого боку до eclub.com.ua напряму, чи тільки через curly-voice-8a71).
  try {
    const url = `https://eclub.com.ua/api/v1/json/routes/${API_KEY}/?from=1&to=4&crc=auto&date=22-11-2026`;
    const backendRes = await fetch(url, { cache: "no-store" });
    const rawText = await backendRes.text();
    results.push({ label: "КОНТРОЛЬ: routes напряму (Кеп підтвердив робочий приклад)", url, httpStatus: backendRes.status, raw: rawText.slice(0, 500) + (rawText.length > 500 ? "…(обрізано)" : "") });
  } catch (err) {
    results.push({ label: "КОНТРОЛЬ: routes напряму", error: err instanceof Error ? err.message : String(err) });
  }

  res.status(200).json({ oid, results });
}
