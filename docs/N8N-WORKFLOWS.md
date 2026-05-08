# n8n Workflow Setup Guide

SafeVision routes safety alerts through n8n so operators can send notifications
to WhatsApp and email without coupling the application to any specific messaging
provider. This guide walks through importing the pre-built workflows and wiring
them into the platform.

---

## How It Works

```
Rule Engine
  └─▶ events.violation (Redis Stream)
        └─▶ Notification Service
              ├─▶ POST /webhook/safevision-whatsapp  ─▶ n8n ─▶ Twilio WhatsApp
              ├─▶ POST /webhook/safevision-email     ─▶ n8n ─▶ SMTP / Gmail
              └─▶ WebSocket /ws/incidents            ─▶ Config UI dashboard
```

The Notification Service POSTs a JSON body to each configured n8n webhook URL.
The n8n workflow receives it, formats the message, and dispatches it to the
chosen provider.

### Payload Schema

Every POST to an n8n webhook carries a `ViolationEvent` JSON object:

```json
{
  "event_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "rule_name": "no_helmet_welding_bay",
  "camera_id": "cam01",
  "zone_id": "welding_bay",
  "severity": "high",
  "channel": "whatsapp",
  "detected_at": "2026-05-08T12:34:56.123Z",
  "detection_payload": {
    "camera_id": "cam01",
    "frame_id": 12345,
    "timestamp": "2026-05-08T12:34:56.123Z",
    "objects": [
      {
        "track_id": 1,
        "class_name": "person",
        "confidence": 0.87,
        "bbox": { "x1": 100, "y1": 50, "x2": 200, "y2": 300 },
        "zone_ids": ["welding_bay"]
      }
    ]
  },
  "trace_id": "1234567890abcdef"
}
```

`severity` is one of: `low` | `medium` | `high` | `critical`
`channel` is one of: `whatsapp` | `email` | `dashboard` | `all`

---

## Prerequisites

| Requirement | Notes |
|---|---|
| n8n running | `docker compose up -d n8n` — available at `http://localhost:5678` |
| n8n database | Run `docker exec safevision-postgres-1 createdb -U safevision n8n` once |
| Twilio account | For WhatsApp; free trial covers testing |
| SMTP server | Gmail, SendGrid, or any SMTP relay |

---

## Step 1 — First-Time n8n Setup

1. Navigate to `http://localhost:5678` (or your n8n host).
2. Create an admin account when prompted.
3. Go to **Settings → n8n API** and note the instance URL — you'll need it for
   the `.env` `N8N_WHATSAPP_WEBHOOK_URL` and `N8N_EMAIL_WEBHOOK_URL` values.

---

## Step 2 — Import Workflows

1. In n8n, click **Workflows → Import from file**.
2. Import `infra/n8n/workflows/safevision-whatsapp-alerts.json`.
3. Repeat for `infra/n8n/workflows/safevision-email-alerts.json`.

After import each workflow is **inactive**. Complete the credential and variable
steps below before activating.

---

## Step 3 — Configure Credentials

### WhatsApp (Twilio)

1. In n8n go to **Credentials → Add credential → HTTP Basic Auth**.
2. Name it **Twilio Basic Auth**.
3. Set **User** = your Twilio Account SID (starts with `AC…`).
4. Set **Password** = your Twilio Auth Token.
5. Save. The credential is referenced by the *Send via Twilio WhatsApp* node.

> **Twilio sandbox**: For testing, enable the WhatsApp Sandbox in the Twilio
> console and join it by sending the join keyword from your test phone number.

### Email (SMTP)

1. In n8n go to **Credentials → Add credential → SMTP**.
2. Name it **SMTP**.
3. Fill in your SMTP server details:

| Field | Example |
|---|---|
| Host | `smtp.gmail.com` |
| Port | `587` |
| User | `alerts@yourcompany.com` |
| Password | App password (not account password for Gmail) |
| SSL/TLS | `STARTTLS` |

4. Save. The credential is referenced by the *Send Email* node.

---

## Step 4 — Set n8n Variables

Both workflows use n8n Variables for values that differ between environments.

Go to **Settings → Variables** and create:

| Variable | Workflow | Example Value |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | WhatsApp | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `WHATSAPP_SENDER` | WhatsApp | `+14155238886` (Twilio sandbox number) |
| `WHATSAPP_RECIPIENT` | WhatsApp | `+15550001234` (operator's number) |
| `ALERT_EMAIL_FROM` | Email | `alerts@yourcompany.com` |
| `ALERT_EMAIL_RECIPIENT` | Email | `safety-team@yourcompany.com` |
| `SAFEVISION_HOST` | Email | `safevision.yourcompany.com` |

> For multiple recipients, duplicate the *Send Email* or *Send via Twilio*
> node and chain them — n8n doesn't support comma-separated recipients in the
> variable directly.

---

## Step 5 — Activate and Copy Webhook URLs

1. Open the **WhatsApp** workflow and click **Activate**.
2. Click the **Webhook** node → copy the **Production URL** shown in the panel.
   It will look like:
   ```
   https://your-n8n-host/webhook/safevision-whatsapp
   ```
3. Paste it into your `.env` file:
   ```
   N8N_WHATSAPP_WEBHOOK_URL=https://your-n8n-host/webhook/safevision-whatsapp
   ```
4. Repeat for the **Email** workflow → `N8N_EMAIL_WEBHOOK_URL`.
5. Restart the notification service to pick up the new URLs:
   ```bash
   docker compose restart notification
   ```

For Kubernetes, update the Helm values and roll the deployment:
```yaml
# values.yaml
notification:
  n8nWhatsappWebhookUrl: "https://your-n8n-host/webhook/safevision-whatsapp"
  n8nEmailWebhookUrl: "https://your-n8n-host/webhook/safevision-email"
```
```bash
helm upgrade safevision infra/k8s/safevision --values infra/k8s/safevision/values.yaml
```

---

## Step 6 — Test End-to-End

### Option A — Push a test event via the helper script

```bash
# From repo root — requires a running Redis on localhost:6379
python scripts/push-test-stream.sh
```

### Option B — POST directly to the webhook

```bash
curl -X POST http://localhost:5678/webhook-test/safevision-whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "00000000-0000-0000-0000-000000000001",
    "rule_name": "no_helmet_welding_bay",
    "camera_id": "cam01",
    "zone_id": "welding_bay",
    "severity": "high",
    "channel": "whatsapp",
    "detected_at": "2026-05-08T12:00:00.000Z",
    "detection_payload": {
      "camera_id": "cam01", "frame_id": 1, "timestamp": "2026-05-08T12:00:00.000Z",
      "objects": [{"track_id":1,"class_name":"person","confidence":0.9,
                   "bbox":{"x1":0,"y1":0,"x2":100,"y2":200},"zone_ids":["welding_bay"]}]
    },
    "trace_id": "test"
  }'
```

> Use the **Test URL** (`/webhook-test/`) while the workflow is inactive and the
> **Production URL** (`/webhook/`) once it is active.

---

## Workflow Logic

### WhatsApp workflow

```
Webhook (POST)
  ├─▶ Respond 202 (immediately, before processing)
  └─▶ Filter Critical + High
        ├─▶ [severity ≠ low] Format Message → Send via Twilio WhatsApp
        └─▶ [severity = low]  (dropped — low severity not sent to WhatsApp)
```

The message format sent to WhatsApp:

```
🚨 SafeVision Safety Alert

Severity: HIGH
Rule: no helmet welding bay
Zone: welding bay
Camera: cam01
Time: 08/05/2026, 12:00:00 UTC

Event ID: 00000000-0000-0000-0000-000000000001
```

### Email workflow

```
Webhook (POST)
  ├─▶ Respond 202
  └─▶ Severity Router
        ├─▶ critical → Format Email → Send Email (HTML + plain-text)
        ├─▶ high     → Format Email → Send Email
        ├─▶ medium   → Format Email → Send Email
        └─▶ low      → (dropped — configurable by editing the Switch node)
```

The email subject line format:
```
[SafeVision] HIGH Alert — no helmet welding bay
```

---

## Customising the Workflows

| Goal | How |
|---|---|
| Add a recipient | Duplicate the Send node and wire it in parallel |
| Change severity filter | Edit the **Filter** / **Switch** node conditions |
| Add a Teams/Slack channel | Add an HTTP Request node after *Format Message* targeting the Teams/Slack incoming webhook URL |
| On-call escalation | Add an n8n *Wait* node + second send if the first delivery fails |
| Multiple WhatsApp numbers | Put numbers in a Code node array and use a *Loop Over Items* node |

---

## Dead-Letter Queue

When all three delivery attempts fail, the Notification Service writes the event
to the Redis list `notifications.dlq`. A background task retries the DLQ every
60 seconds.

To inspect and drain the DLQ manually:

```bash
# Count events in DLQ
docker exec safevision-redis-1 redis-cli llen notifications.dlq

# Pop and print one event (destructive)
docker exec safevision-redis-1 redis-cli rpop notifications.dlq

# Clear the entire DLQ
docker exec safevision-redis-1 redis-cli del notifications.dlq
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Notification service logs `channel.not_configured whatsapp` | `N8N_WHATSAPP_WEBHOOK_URL` is blank | Set the env var and restart |
| n8n logs `404 Not Found` for webhook | Workflow is not active | Click **Activate** in n8n |
| WhatsApp message not received | Twilio sandbox join not completed | Send the join keyword from the recipient's phone |
| Email bounced / no delivery | Wrong SMTP credentials | Re-test the SMTP credential in n8n |
| Events piling up in DLQ | n8n down or webhook returning 5xx | Check n8n health; inspect DLQ with redis-cli |
| `auth` error from Twilio | Wrong Account SID or Auth Token | Regenerate token in Twilio console |
