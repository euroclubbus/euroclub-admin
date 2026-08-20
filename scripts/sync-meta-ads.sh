#!/usr/bin/env bash
# Тягне дані з Meta Marketing API (рекламний кабінет EuroClub) і зберігає
# їх у public/data/meta-ads.json — панель Маркетинг читає цей файл напряму.
#
# Використовує МАКСИМАЛЬНИЙ набір полів Insights API (~45 полів) — все,
# що Meta взагалі віддає на рівні кампанії. Частина полів буде порожньою
# для кампаній з цілями, до яких вони не стосуються (напр. video-метрики
# для кампаній без відео) — це нормальна поведінка API, не помилка.
#
# Потрібні env-змінні (задаються як GitHub Secrets):
#   META_ACCESS_TOKEN   — System User токен без терміну дії (ads_read, ads_management)
#   META_AD_ACCOUNT_ID  — напр. act_1118039983089010
set -euo pipefail

API_VERSION="v26.0"
OUT_FILE="public/data/meta-ads.json"

if [ -z "${META_ACCESS_TOKEN:-}" ] || [ -z "${META_AD_ACCOUNT_ID:-}" ]; then
  echo "META_ACCESS_TOKEN / META_AD_ACCOUNT_ID не задані" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT_FILE")"

INSIGHTS_FIELDS="campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,\
account_id,account_name,date_start,date_stop,\
impressions,reach,frequency,spend,\
clicks,unique_clicks,inline_link_clicks,unique_inline_link_clicks,inline_link_click_ctr,\
outbound_clicks,unique_outbound_clicks,cost_per_outbound_click,\
cpm,cpc,cpp,ctr,unique_ctr,cost_per_unique_click,\
actions,action_values,cost_per_action_type,unique_actions,\
conversions,conversion_values,cost_per_conversion,\
inline_post_engagement,\
video_play_actions,video_avg_time_watched_actions,\
video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,\
video_p95_watched_actions,video_p100_watched_actions,video_thruplay_watched_actions,\
quality_ranking,engagement_rate_ranking,conversion_rate_ranking,\
objective,buying_type,optimization_goal"

# 1. Валюта і назва кабінету
account_json=$(curl -s -G "https://graph.facebook.com/${API_VERSION}/${META_AD_ACCOUNT_ID}" \
  --data-urlencode "fields=name,currency" \
  --data-urlencode "access_token=${META_ACCESS_TOKEN}")

# 2. Insights по кампаніях за останні 30 днів — повний набір полів
insights_json=$(curl -s -G "https://graph.facebook.com/${API_VERSION}/${META_AD_ACCOUNT_ID}/insights" \
  --data-urlencode "level=campaign" \
  --data-urlencode "date_preset=last_30d" \
  --data-urlencode "fields=${INSIGHTS_FIELDS}" \
  --data-urlencode "limit=200" \
  --data-urlencode "access_token=${META_ACCESS_TOKEN}")

# 3. Список усіх кампаній (щоб бачити й ті, де за 30 днів не було показів)
campaigns_json=$(curl -s -G "https://graph.facebook.com/${API_VERSION}/${META_AD_ACCOUNT_ID}/campaigns" \
  --data-urlencode "fields=id,name,status,objective,buying_type" \
  --data-urlencode "limit=200" \
  --data-urlencode "access_token=${META_ACCESS_TOKEN}")

generated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

jq -n \
  --arg generatedAt "$generated_at" \
  --argjson account "$account_json" \
  --argjson insights "$insights_json" \
  --argjson campaigns "$campaigns_json" \
  '
  def num(x): (x // "0") | tonumber;
  def sumActionsLike($arr; $needle): ($arr // []) | map(select(.action_type | test($needle))) | map(.value | tonumber) | add // 0;

  ($campaigns.data // []) as $allCampaigns |
  ($insights.data // []) as $allInsights |

  {
    generatedAt: $generatedAt,
    account: { id: $account.id, name: $account.name, currency: $account.currency },
    campaigns: [
      $allCampaigns[] as $c |
      (($allInsights[] | select(.campaign_id == $c.id)) // null) as $i |
      {
        id: $c.id,
        name: $c.name,
        status: $c.status,
        objective: $c.objective,
        buyingType: $c.buying_type,

        impressions: num($i.impressions),
        reach: num($i.reach),
        frequency: (($i.frequency // "0") | tonumber),
        spend: (($i.spend // "0") | tonumber),

        clicks: num($i.clicks),
        uniqueClicks: num($i.unique_clicks),
        inlineLinkClicks: num($i.inline_link_clicks),
        uniqueInlineLinkClicks: num($i.unique_inline_link_clicks),
        outboundClicks: sumActionsLike($i.outbound_clicks; "outbound_click"),
        uniqueOutboundClicks: sumActionsLike($i.unique_outbound_clicks; "outbound_click"),

        cpm: (($i.cpm // "0") | tonumber),
        cpc: (($i.cpc // "0") | tonumber),
        cpp: (($i.cpp // "0") | tonumber),
        ctr: (($i.ctr // "0") | tonumber),
        uniqueCtr: (($i.unique_ctr // "0") | tonumber),
        costPerOutboundClick: sumActionsLike($i.cost_per_outbound_click; "outbound_click"),

        leads: sumActionsLike($i.actions; "lead"),
        purchases: sumActionsLike($i.actions; "purchase"),
        messagingConversations: sumActionsLike($i.actions; "onsite_conversion.messaging_conversation_started"),
        actions: ($i.actions // []),
        actionValues: ($i.action_values // []),
        costPerActionType: ($i.cost_per_action_type // []),
        conversions: ($i.conversions // []),
        conversionValues: ($i.conversion_values // []),
        costPerConversion: ($i.cost_per_conversion // []),

        inlinePostEngagement: num($i.inline_post_engagement),

        videoPlays: sumActionsLike($i.video_play_actions; "video_view"),
        videoThruplay: sumActionsLike($i.video_thruplay_watched_actions; ""),
        videoP25: sumActionsLike($i.video_p25_watched_actions; ""),
        videoP50: sumActionsLike($i.video_p50_watched_actions; ""),
        videoP75: sumActionsLike($i.video_p75_watched_actions; ""),
        videoP95: sumActionsLike($i.video_p95_watched_actions; ""),
        videoP100: sumActionsLike($i.video_p100_watched_actions; ""),

        qualityRanking: $i.quality_ranking,
        engagementRateRanking: $i.engagement_rate_ranking,
        conversionRateRanking: $i.conversion_rate_ranking,

        optimizationGoal: $i.optimization_goal,
        dateStart: $i.date_start,
        dateStop: $i.date_stop
      }
    ]
  }
  ' > "$OUT_FILE"

echo "Записано $OUT_FILE"
