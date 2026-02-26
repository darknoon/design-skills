# Vectorization with Quiver

[QuiverAI](https://quiver.ai) converts raster images (PNG, JPEG, WebP) into clean SVG output via a dedicated vectorization API. Use this after generating an icon image with `t2i.py` to get an SVG.

## Pricing

**$0.30 per credit** (prepaid, 1–1,000 credits at a time). One successful API request = 1 credit, regardless of `n`. Buy credits at [app.quiver.ai/settings/api-keys](https://app.quiver.ai/settings/api-keys).

## API key

Set `QUIVER_API_KEY` in your environment:

```bash
export QUIVER_API_KEY=your-key-here
```

Get a key at https://quiver.ai.

## Endpoint

`POST https://api.quiver.ai/v1/svgs/vectorizations`

### Request fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | yes | Model ID — use `"arrow-preview"` |
| `image` | object | yes | `{"url": "https://..."}` or `{"base64": "..."}` |
| `n` | integer | no | Number of SVG outputs, 1–16 (default 1) |
| `auto_crop` | boolean | no | Crop image to subject before vectorizing |
| `target_size` | integer | no | Resize input to this pixel dimension (128–4096) before processing |
| `stream` | boolean | no | Stream output via Server-Sent Events |
| `temperature` | number | no | 0–2, default 1 |

### Minimal curl example

```bash
curl https://api.quiver.ai/v1/svgs/vectorizations \
  -H "Authorization: Bearer $QUIVER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "arrow-preview",
    "image": {"url": "https://example.com/icon.png"},
    "auto_crop": true
  }'
```

### With a local file (base64)

```bash
IMAGE_B64=$(base64 -i icon.png)
curl https://api.quiver.ai/v1/svgs/vectorizations \
  -H "Authorization: Bearer $QUIVER_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\": \"arrow-preview\", \"image\": {\"base64\": \"$IMAGE_B64\"}, \"auto_crop\": true}"
```

## Typical workflow

1. Generate a raster image with `t2i.py`
2. Run `scripts/vectorize.py` to call Quiver and save the SVG
3. Clean up the SVG output if needed (remove unnecessary groups, normalize stroke attributes)

See `scripts/vectorize.py`.
