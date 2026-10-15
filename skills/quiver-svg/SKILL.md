---
name: quiver-svg
description: Generate SVG alternatives from image references and refine an existing SVG through the QuiverAI Arrow 2 Telos API. Use when an agent needs vector assets that match visual examples or wants to delegate SVG drawing while retaining control of the surrounding task.
---

# Quiver SVG

Use **`arrow-2-telos`** to draw or revise SVG assets. The outer agent prepares
references, chooses directions, compares rendered results, and integrates the
chosen SVG into the user's work.

## Call the helper

Run `scripts/quiver_svg.py` relative to this skill's directory. It needs Python
3.10+ (standard library only), HTTPS access to `api.quiver.ai`, and
`QUIVERAI_API_KEY` in the environment. Keep the key out of prompts and arguments.

**Codex on Linux:** run the helper in the foreground with `exec_command`'s
`tty: true`; also use it for preview servers that must survive image viewing.
Poll any returned session ID with `write_stdin` until the helper finishes.
Without a TTY, viewing images can terminate pending commands with SIGTERM
([Codex bug](https://github.com/openai/codex/issues/46702), reproduced in 0.154.0
and 0.159.3). Other harnesses can invoke the Python helper normally.

Generate N alternatives from ordered image references:

```sh
python3 /path/to/quiver-svg/scripts/quiver_svg.py generate \
  --prompt-file brief.txt \
  --reference reference-1.png --reference reference-2.png \
  --viewbox 0 0 24 24 --n 3 --out options/initial
```

This calls `POST /v1/svgs/generations` with `references` and `attributes.viewBox`.
`n` samples the same brief; use separate calls for different concepts. Outputs
are `option_1.svg`, `option_2.svg`, etc., numbered in returned order.

Refine an option with a focused change request and the same style references:

```sh
python3 /path/to/quiver-svg/scripts/quiver_svg.py edit \
  --svg options/initial/option_2.svg --prompt-file revision.txt \
  --reference reference-1.png --reference reference-2.png \
  --out options/revision-1
```

This calls `POST /v1/svgs/edits` with `svg` and `reference_images`; the revision
is `options/revision-1/option_1.svg`. Each edit includes its source and references.
The outer agent's conversation carries the critique and selection history.

Use a new output directory per call. The helper preserves the request body in
`request.json`, the raw response in `response.json`, and the server request ID,
HTTP status, usage, elapsed time and output paths in `summary.json`. Keep these
files with the task's assets: requests contain the reference images and edit source.

`--dry-run` saves the request without network access. Optional `--reasoning-effort`
accepts `low`, `medium`, `high`, or `xhigh`; omission retains Quiver's default.
The helper uses a 20-minute socket timeout and makes no automatic retries.
It leaves sampling parameters and output-token limits at provider defaults.

## Prepare references and concise briefs

Rasterize vector references directly near **512×512 pixels**, preserving aspect
ratio for non-square assets. Enlarging a small PNG cannot restore fine detail.
For webpage sources, render each original SVG with its CSS colors, strokes and
background intact at the larger size, then screenshot its bounds. Preserve its
viewBox and scale the whole vector, including strokes. Retain the full silhouette,
avoid unrelated labels, and inspect the crops. The helper uploads bytes unchanged.

Ask for the desired **output viewBox** if the user or destination asset does not
establish one. Specify it separately from reference resolution and display size:
a 512×512 reference can guide an SVG with `viewBox="0 0 24 24"` displayed at 24px.
For generation, pass `--viewbox` to set the API's `attributes.viewBox` field;
prompting alone failed to enforce it in testing. Editing has no equivalent
documented field, so request the desired viewBox in the edit prompt and check it.
Never change only the returned viewBox attribute to convert coordinates.

Keep briefs to a short paragraph or a few bullets: output viewBox/size first,
then subject and essential style constraints. Let references convey geometry.
Avoid repeated rules, long exclusion lists and coordinate-by-coordinate recipes.
For example:

> Output viewBox="0 0 24 24", width="24", height="24"; draw in 24-unit coordinates.
> Create a compass matching references 1–4: rounded two-tone shapes, consistent
> optical weight, generous negative space. Transparent background, no labels.
> References are 512×512 renders; the icon displays at 24 CSS px.

Render candidates in context and at their final display size. Check the returned
viewBox and appearance; XML validation alone does not establish correctness.
For edits, name the observed problem, requested change and what must stay fixed.
Preserve earlier alternatives and finish the surrounding deliverables yourself.

## Cost and incomplete calls

Telos is token-priced. As checked September 30, 2026, standard rates are **$6/M
input tokens and $30/M output tokens**, including reasoning. At these rates,
2,000 input + 10,000 output tokens is about **$0.31**. Cache rates differ; estimates
are not settled charges. Small-icon tests with four references cost an estimated
**$0.09–$0.17 per generation and $0.05 per edit**, excluding the outer agent.
Generation took roughly a minute. These are observations, not guarantees.
Use the saved usage and [current pricing](https://docs.quiver.ai/developers/pricing)
for cost estimates; N options and subsequent edits add paid work.

Generation accepts `n=1..16` and up to 16 references; editing accepts four
references, one SVG up to 200,000 characters and a prompt up to 4,000 characters.
Reference formats are PNG/JPEG/WebP/GIF/SVG, up to 12 MiB and 4096×4096 each.
The API validates its limits and model access. The helper saves valid returned
SVGs unchanged, exits 0 on completion, 2 for a partial batch, and 1 on error.

A successful HTTP response may contain fewer SVGs than requested. Keep those
outputs and inspect the logs before requesting missing options. A timeout can
leave the outcome unknown; automatically repeating a POST can charge again.
Surface incomplete calls as failures; do not silently replace Quiver output with
SVGs drawn by the outer agent.

Official contracts: [generation](https://docs.quiver.ai/api-reference/create-svgs/generate-svg),
[editing](https://docs.quiver.ai/api-reference/edit-svg/edit-svg), and
[partial results](https://docs.quiver.ai/developers/guides/partial-batch-results).
