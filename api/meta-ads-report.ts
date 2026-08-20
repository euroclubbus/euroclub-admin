import type { VercelRequest, VercelResponse } from "@vercel/node";

// On-demand звіт з Meta Marketing API за довільний діапазон дат.
// Викликається лише коли адмін сам натискає "Показати кампанії" в панелі
// (або коли Claude робить web_fetch на це саме посилання) — жодного
// автоматичного/фонового запуску, на відміну від попередньої версії через
// GitHub Actions.
//
// GET /api/meta-ads-report?since=2026-07-01&until=2026-08-01
//
// Потрібні env-змінні у Vercel (Project Settings → Environment Variables):
//   META_ACCESS_TOKEN   — System User токен без терміну дії (ads_read, ads_management)
//   META_AD_ACCOUNT_ID  — напр. act_1118039983089010

const API_VERSION = "v26.0";

const INSIGHTS_FIELDS = [
  "campaign_id", "campaign_name", "adset_id", "adset_name",
  "impressions", "reach", "frequency", "spend",
  "clicks", "unique_clicks", "inline_link_clicks", "unique_inline_link_clicks", "inline_link_click_ctr",
  "outbound_clicks", "unique_outbound_clicks", "cost_per_outbound_click",
  "cpm", "cpc", "cpp", "ctr", "unique_ctr",
  "actions", "action_values", "cost_per_action_type",
  "conversions", "conversion_values", "cost_per_conversion",
  "inline_post_engagement",
  "video_play_actions", "video_avg_time_watched_actions",
  "video_p25_watched_actions", "video_p50_watched_actions", "video_p75_watched_actions",
  "video_p95_watched_actions", "video_p100_watched_actions", "video_thruplay_watched_actions",
  "quality_ranking", "engagement_rate_ranking", "conversion_rate_ranking",
  "objective", "buying_type", "optimization_goal",
].join(",");

function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function sumActionsLike(arr: { action_type: string; value: string }[] | undefined, needle: string): number {
  if (!arr) return 0;
  return arr
    .filter((a) => a.action_type?.includes(needle))
    .reduce((sum, a) => sum + Number(a.value || 0), 0);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Метод не підтримується" });
    return;
  }

  const { since, until } = req.query;

  if (!isYmd(since) || !isYmd(until)) {
    res.status(400).json({ error: "Потрібні параметри since і until у форматі YYYY-MM-DD" });
    return;
  }

  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  if (!accessToken || !adAccountId) {
    res.status(500).json({ error: "META_ACCESS_TOKEN / META_AD_ACCOUNT_ID не задані в env-змінних Vercel" });
    return;
  }

  try {
    const accountUrl = new URL(`https://graph.facebook.com/${API_VERSION}/${adAccountId}`);
    accountUrl.searchParams.set("fields", "name,currency");
    accountUrl.searchParams.set("access_token", accessToken);

    const insightsUrl = new URL(`https://graph.facebook.com/${API_VERSION}/${adAccountId}/insights`);
    insightsUrl.searchParams.set("level", "campaign");
    insightsUrl.searchParams.set("time_range", JSON.stringify({ since, until }));
    insightsUrl.searchParams.set("fields", INSIGHTS_FIELDS);
    insightsUrl.searchParams.set("limit", "500");
    insightsUrl.searchParams.set("access_token", accessToken);

    const [accountRes, insightsRes] = await Promise.all([fetch(accountUrl), fetch(insightsUrl)]);

    const accountJson = await accountRes.json();
    const insightsJson = await insightsRes.json();

    if (!accountRes.ok) {
      res.status(502).json({ error: "Meta API (account) відповів помилкою", details: accountJson });
      return;
    }
    if (!insightsRes.ok) {
      res.status(502).json({ error: "Meta API (insights) відповів помилкою", details: insightsJson });
      return;
    }

    // Пагінація: якщо в діапазоні багато кампаній, підвантажуємо решту сторінок.
    let allInsights: any[] = insightsJson.data ?? [];
    let nextUrl: string | undefined = insightsJson.paging?.next;
    let guard = 0;
    while (nextUrl && guard < 10) {
      const pageRes = await fetch(nextUrl);
      const pageJson = await pageRes.json();
      if (!pageRes.ok) break;
      allInsights = allInsights.concat(pageJson.data ?? []);
      nextUrl = pageJson.paging?.next;
      guard++;
    }

    const campaigns = allInsights.map((i: any) => ({
      id: i.campaign_id,
      name: i.campaign_name,
      objective: i.objective,
      buyingType: i.buying_type,
      optimizationGoal: i.optimization_goal,

      impressions: Number(i.impressions || 0),
      reach: Number(i.reach || 0),
      frequency: Number(i.frequency || 0),
      spend: Number(i.spend || 0),

      clicks: Number(i.clicks || 0),
      uniqueClicks: Number(i.unique_clicks || 0),
      inlineLinkClicks: Number(i.inline_link_clicks || 0),

      cpm: Number(i.cpm || 0),
      cpc: Number(i.cpc || 0),
      cpp: Number(i.cpp || 0),
      ctr: Number(i.ctr || 0),
      uniqueCtr: Number(i.unique_ctr || 0),

      leads: sumActionsLike(i.actions, "lead"),
      purchases: sumActionsLike(i.actions, "purchase"),
      messagingConversations: sumActionsLike(i.actions, "onsite_conversion.messaging_conversation_started"),
      actions: i.actions ?? [],
      actionValues: i.action_values ?? [],
      costPerActionType: i.cost_per_action_type ?? [],
      conversions: i.conversions ?? [],
      conversionValues: i.conversion_values ?? [],
      costPerConversion: i.cost_per_conversion ?? [],

      inlinePostEngagement: Number(i.inline_post_engagement || 0),

      videoPlays: sumActionsLike(i.video_play_actions, "video_view"),
      videoThruplay: sumActionsLike(i.video_thruplay_watched_actions, ""),
      videoP25: sumActionsLike(i.video_p25_watched_actions, ""),
      videoP50: sumActionsLike(i.video_p50_watched_actions, ""),
      videoP75: sumActionsLike(i.video_p75_watched_actions, ""),
      videoP95: sumActionsLike(i.video_p95_watched_actions, ""),
      videoP100: sumActionsLike(i.video_p100_watched_actions, ""),

      qualityRanking: i.quality_ranking,
      engagementRateRanking: i.engagement_rate_ranking,
      conversionRateRanking: i.conversion_rate_ranking,
    }));

    res.status(200).json({
      generatedAt: new Date().toISOString(),
      range: { since, until },
      account: { id: accountJson.id, name: accountJson.name, currency: accountJson.currency },
      campaigns,
    });
  } catch (err) {
    console.error("meta-ads-report error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Внутрішня помилка" });
  }
}
