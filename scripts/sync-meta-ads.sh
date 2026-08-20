#!/usr/bin/env bash
# Тягне дані з Meta Marketing API (рекламний кабінет EuroClub) і зберігає
# їх у public/data/meta-ads.json — панель Маркетинг читає цей файл напряму.
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

# 1. Валюта і назва кабінету
account_json=$(curl -s -G "https://graph.facebook.com/${API_VERSION}/${META_AD_ACCOUNT_ID}" \
  --data-urlencode "fields=name,currency" \
  --data-urlencode "access_token=${META_ACCESS_TOKEN}")

# 2. Insights по кампаніях за останні 30 днів
insights_json=$(curl -s -G "https://graph.facebook.com/${API_VERSION}/${META_AD_ACCOUNT_ID}/insights" \
  --data-urlencode "level=campaign" \
  --data-urlencode "date_preset=last_30d" \
  --data-urlencode "fields=campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,actions" \
  --data-urlencode "limit=200" \
  --data-urlencode "access_token=${META_ACCESS_TOKEN}")

# 3. Список усіх кампаній (щоб бачити й ті, де за 30 днів не було показів — напр. паузні)
campaigns_json=$(curl -s -G "https://graph.facebook.com/${API_VERSION}/${META_AD_ACCOUNT_ID}/campaigns" \
  --data-urlencode "fields=id,name,status,objective" \
  --data-urlencode "limit=200" \
  --data-urlencode "access_token=${META_ACCESS_TOKEN}")

generated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

jq -n \
  --arg generatedAt "$generated_at" \
  --argjson account "$account_json" \
  --argjson insights "$insights_json" \
  --argjson campaigns "$campaigns_json" \
  '
  # leads = сума actions з action_type, що містить "lead"
  def leadsOf(a): (a.actions // []) | map(select(.action_type | test("lead"))) | map(.value | tonumber) | add // 0;

  ($campaigns.data // []) as $allCampaigns |
  ($insights.data // []) as $allInsights |

  {
    generatedAt: $generatedAt,
    account: { id: $account.id, name: $account.name, currency: $account.currency },
    campaigns: [
      $allCampaigns[] as $c |
      ($allInsights[] | select(.campaign_id == $c.id)) as $i? |
      {
        id: $c.id,
        name: $c.name,
        status: $c.status,
        objective: $c.objective,
        spend: (($i.spend // "0") | tonumber),
        impressions: (($i.impressions // "0") | tonumber),
        clicks: (($i.clicks // "0") | tonumber),
        ctr: (($i.ctr // "0") | tonumber),
        cpc: (($i.cpc // "0") | tonumber),
        leads: (if $i then leadsOf($i) else 0 end)
      }
    ]
  }
  ' > "$OUT_FILE"

echo "Записано $OUT_FILE"
