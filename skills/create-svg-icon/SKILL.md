---
name: create-svg-icon
description: Design beautiful SVG icons that match your design style for use in UI (eg ios apps, android apps, web apps, documentation, &c). Output svg text, a React component, or standalone .svg file. Use when asked to draw, design, or generate an icon, glyph, or symbol. Also use when adapting or referencing an icon from an existing icon set to a different style (but not just for converting mechanically to a component).
argument-hint: "[icon description or name]"
allowed-tools: Read, Write, Glob, Bash(python scripts/*), Bash(python skills/create-svg-icon/scripts/*), Bash(uv run scripts/*), Bash(uv run skills/create-svg-icon/scripts/*), Bash(mkdir -p *)
---

# Create SVG Icon

This skill describes common processes for making clean SVG icons for UI, based on a defined visual style and aware of the intended context.

You keep the user informed about your progress in this chat, but you write more comprehensive info to `PROGRESS.md` in the output directory.

At a high level, we

- 1. design concepts
- 2. use t2i models
- 3. select good directions
- 4. vectorize with quiver
- 5. help add to production for their codebase (if applicable)

## Workflow

Save temporary images somewhere safe in the user's current directory (don't put things in /tmp) using the following structure if the prompt was for example:

"I need an icon of a man walking a dog in sf symbols style"

- .context/icon_skill/
  - man-walking-dog-01/
    PROGRESS.md (explained below)
    - concepts/
      - 01-man-left-dog-right/
        - prompt.md
        - 01-gpt-image-1.png
        - 02-gemini-3.1-flash-image.png
      - 02-dog-dominant/
        - prompt.md
        - concept-2.png
      - concept-3.png
    - iteration-01/
      - icon.svg
      - icon-512.png (rasterized for clear visibility)
      - icon-24.png (rasterized at final size for quality check)
    - iteration-02/
      - …
    - final/
      - icon.svg
      - icon.png

## PROGRESS.md

Keep a running log of your work by **appending** to this file as you go — never rewrite it. It should read like a journal so the user can follow along and pick up where you left off across sessions.

Each entry should include:

- What you tried and why
- The prompts you used for t2i generation
- Links to every image generated (relative paths from the icon folder), so the user can open them directly
- Your assessment of what worked and what didn't
- What you plan to do next

Example:

```md
## Context

User has requested an icon of a man walking a dog in sf symbols style.

SF symbols icons:

## Concept 1 — man-left-dog-right

Model: gpt-image-1 [prompt](concepts/01-man-left-dog-right/prompt.md)

![concept](concepts/01-man-left-dog-right/01-gpt-image-1.png)

Assessment: Good silhouette but dog reads as a cat. Leash is clear. Will try a more specific dog breed.

## Iteration 1

Vectorized concept 1 with --auto-crop. Clean output but lost the leash detail.

![iteration](iteration-01/icon.png)

Next: Try vectorizing without auto-crop and manually trim the viewBox.
```

**1. Gain context about the current project and icon needs**

Information you're looking for:

- How will this icon be used?
  - if we're able to get specific HTML context that's ideal b/c then we can see visually how we need to adapt to eg text to the right of the icon, sitting in a button etc.

- What's the overall visual style of the icon set?
  - If the user is making a one-off icon, then we can offer a couple alternatives of visual styles. see `references/icon-sets.md` for examples of popular styles and their characteristics.

- If the user references a named icon set (e.g. "phosphor style", "lucide style") → fetch 3–5 representative SVGs from that set as visual style references. Use `get-icon.py search` to find a mix of simple and complex icons (see `references/icon-sets.md` for set names and `references/image-gen.md` for why references matter). Save to `.context/icon_skill/<name>/refs/`. These will be passed as `--reference` to t2i.py. **Do NOT just describe the style in the prompt text — always fetch real SVGs and pass them as references.**

**Decide the generation method before proceeding:**

| Icon type                                                          | Method                                 |
| ------------------------------------------------------------------ | -------------------------------------- |
| Simple geometric (arrow, check, chevron, plus, circle, line)       | Write SVG paths directly               |
| Semi-complex (home, calendar, folder, lock)                        | **Use t2i.py + vectorize.py pipeline** |
| Representational (animal, person, place, food, vehicle, flag, map) | **Use t2i.py + vectorize.py pipeline** |
| Stylistic match to existing set                                    | Fetch reference SVGs → pass as `--reference` to t2i.py |

When in doubt, prefer the t2i pipeline. Hand-written SVG paths are not good at organic shapes, geography, or anything with real-world visual complexity.

**2. Consider various concepts**

In a subagent, follow the sketching workflow in `references/02-icon-sketching.md`.

For any icon requiring the **t2i pipeline**:

1. If a target icon set was identified in step 1, fetch and rasterize style references first:
   ```
   # Fetch SVGs from the set
   uv run scripts/get-icon.py search <set> <term1> --count 3 --output-dir .context/icon_skill/<name>/refs/
   uv run scripts/get-icon.py search <set> <term2> --count 2 --output-dir .context/icon_skill/<name>/refs/
   # Rasterize them to PNG so they can be passed to the image generation API
   uv run scripts/rasterize.py .context/icon_skill/<name>/refs/*.svg --output-dir .context/icon_skill/<name>/refs/
   ```
2. Write 2–3 concept prompts (see `references/image-gen.md` for prompt tips and model selection)
3. Run t2i.py, passing the rasterized PNGs as `--reference` for style grounding:
   ```
   uv run scripts/t2i.py "<prompt>" --output .context/icon_skill/<name>/concepts/<concept-N>.png \
     --reference .context/icon_skill/<name>/refs/*.png
   ```
   If no target set, omit `--reference`.
3. Pick the best concept, then vectorize: `uv run scripts/vectorize.py <image.png> --auto-crop`
4. Save the resulting SVG to `iteration-01/icon.svg`
5. Rasterize for preview: `uv run scripts/rasterize.py iteration-01/icon.svg` (defaults to 1024×1024)

Each subagent should run `uv run` commands directly — no dependency checks, version checks, or setup steps. `uv` handles everything. Output a summary of the images generated and their paths.

Always rasterize before evaluating — default size is 1024×1024, giving clear visibility even when the final icon will be 24px. SVG is resolution-independent — design at full clarity, ship at any size.

(see `references/icon-design-principles.md` for SVG quality rules)

**3. Choose the output format**

Ask if unclear; default to inline SVG.

| Format          | When to use                               |
| --------------- | ----------------------------------------- |
| Inline SVG      | Dropping into HTML directly               |
| React component | Used in a React/JSX codebase              |
| `.svg` file     | Saving as an asset, using in design tools |

## Output Templates

see `references/04-icon-production.md` for SVG templates to scale down and refine the icon for production once it's properly designed.

## References

- **`references/icon-design-principles.md`** — Grid, optical sizing, stroke rules, accessibility, common path patterns. Read when drawing from scratch or when quality feels off.
- **`references/icon-sets.md`** — Available icon sets, their style characteristics, CDN/npm sources, and how to look up specific icons. Read when the user references an existing icon or set.
- **`references/image-gen.md`** — Prompt tips, model selection, and script usage for `t2i.py`. Read before generating concept images.
- **`references/vectorization.md`** — How to convert a generated PNG to SVG via Quiver. Read when running the t2i pipeline.
- **`references/02-icon-sketching.md`** — Full sketching workflow including concept generation and evaluation. Read at the start of step 2.
