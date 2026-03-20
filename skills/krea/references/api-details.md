# Krea API Details

## Billing tiers

API and web app share the same compute unit (CU) pool.

| Plan | Price | CU/month | Notes |
|------|-------|----------|-------|
| Free | $0 | 100/day | No API token generation |
| Basic | $9/mo | 5,000 | Commercial license |
| Pro | $35/mo | 20,000 | All video models, Nodes |
| Max | $70/mo | 60,000 | Unlimited relaxed in-house gens |
| Business | $200/mo | 80,000+ | Team features, up to 50 seats |

One-time compute packs (2K-50K CU, valid 90 days) are also available.

For reference: Z Image at ~3 CU = ~6,600 generations on the Pro plan.

## Video models

| Model | Provider | ~CU | ~Time |
|-------|----------|-----|-------|
| `wan-2-1` | Alibaba | ~351 | ~3min |
| `kling-2-5` | Kuaishou | ~275 | ~3min |
| `kling-2-6` | Kuaishou | ~387 | ~4min |
| `veo-3-1` | Google | ~758 | ~5min |

## Enhancement / upscaling

| Model | Type | ~CU | Max resolution |
|-------|------|-----|----------------|
| `topaz` | Faithful upscale | 51 | 22K |
| `topaz-bloom` | Creative upscale | 256 | 10K |
| `topaz-generative` | Creative enhance | 137 | 16K |

## API internals

### Endpoint pattern

```
POST https://api.krea.ai/generate/image/{provider}/{model}
Authorization: Bearer {KREA_API_TOKEN}
Content-Type: application/json
```

The script maps friendly model names to the correct provider/model path (e.g. `z-image` -> `z-image/z-image`, `flux` -> `bfl/flux-1-dev`).

### Job lifecycle

Krea uses an async job model:

1. **Submit** — POST to the generation endpoint. Returns a `job_id` with status `scheduled`.
2. **Poll** — GET `/jobs/{job_id}` every 2-5 seconds. Statuses: `queued`, `processing`, `completed`, `failed`, `cancelled`.
3. **Download** — Result URLs are in `result.urls[]`.

Failed and cancelled jobs don't consume compute units.

### Webhooks

Instead of polling, add `X-Webhook-URL` header to any generation request. Krea will POST to your URL when the job reaches a terminal state:

```json
{
  "job_id": "...",
  "status": "completed",
  "result": { "urls": ["https://..."] }
}
```

## LoRA / style training

Train custom styles via the API:

```
POST https://api.krea.ai/styles/train
{
  "training_type": "style|character|object",
  "model": "flux_dev",
  "steps": 250
}
```

Trained styles are private by default. Share via `POST /styles/{id}/share/workspace`.

## Node Apps

Custom workflow apps built in Krea's node editor, callable via API:

- `GET /node-apps/{versionId}` — get the app's input/output schema
- `POST /node-apps/{versionId}/execute` — run it with JSON input matching the schema

Useful for complex multi-step pipelines.
