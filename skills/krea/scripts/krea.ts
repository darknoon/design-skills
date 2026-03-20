#!/usr/bin/env bun
/**
 * Krea API client — submit image generation jobs, poll for completion, download results.
 *
 * Usage:
 *   bun run krea.ts "a futuristic city" --output city.png
 *   bun run krea.ts "portrait" --model flux --width 768 --height 1024
 *   bun run krea.ts "enhance" --model topaz --image-url https://example.com/img.png
 */

import { parseArgs } from "util";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";

// ---------------------------------------------------------------------------
// .env loading (walk up from cwd to find .env)
// ---------------------------------------------------------------------------

function loadEnv() {
  let dir = process.cwd();
  while (true) {
    const envPath = resolve(dir, ".env");
    if (existsSync(envPath)) {
      for (const line of readFileSync(envPath, "utf-8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) process.env[key] = val;
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

loadEnv();

// ---------------------------------------------------------------------------
// Model registry — maps short names to API endpoint paths
// ---------------------------------------------------------------------------

const MODELS: Record<string, { path: string; type: "image" | "video" | "enhance" }> = {
  // Krea in-house
  "z-image":            { path: "z-image/z-image",           type: "image" },
  // Black Forest Labs
  "flux":               { path: "bfl/flux-1-dev",            type: "image" },
  "flux-kontext":       { path: "bfl/flux-kontext",          type: "image" },
  "flux-1-1-pro":       { path: "bfl/flux-1-1-pro",          type: "image" },
  "flux-1-1-pro-ultra": { path: "bfl/flux-1-1-pro-ultra",    type: "image" },
  // ByteDance
  "seedream-4":         { path: "bytedance/seedream-4",      type: "image" },
  "seedream-5-lite":    { path: "bytedance/seedream-5-lite",  type: "image" },
  // Google
  "imagen-4-fast":      { path: "google/imagen-4-fast",      type: "image" },
  "imagen-4-ultra":     { path: "google/imagen-4-ultra",     type: "image" },
  // Other
  "ideogram-3":         { path: "ideogram/ideogram-3",       type: "image" },
  "chatgpt-image":      { path: "openai/chatgpt-image",     type: "image" },
  // Video
  "wan-2-1":            { path: "alibaba/wan-2-1",           type: "video" },
  "kling-2-5":          { path: "kuaishou/kling-2-5",        type: "video" },
  "kling-2-6":          { path: "kuaishou/kling-2-6",        type: "video" },
  "veo-3-1":            { path: "google/veo-3-1",            type: "video" },
  // Enhancement
  "topaz":              { path: "topaz/upscale",             type: "enhance" },
  "topaz-bloom":        { path: "topaz/bloom",               type: "enhance" },
  "topaz-generative":   { path: "topaz/generative",          type: "enhance" },
};

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const BASE = "https://api.krea.ai";

function getToken(): string {
  const token = process.env.KREA_API_TOKEN;
  if (token) return token;
  console.error(
    "\n  Krea API token not found.\n" +
    "  Generate one at: https://www.krea.ai/settings/api-tokens\n\n" +
    "  Then set it:\n\n" +
    "      export KREA_API_TOKEN=your-id:your-secret\n\n" +
    "  Or add to your .env file:\n\n" +
    "      KREA_API_TOKEN=your-id:your-secret\n"
  );
  process.exit(1);
}

async function apiRequest(method: string, path: string, body?: object): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Krea API ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Job lifecycle
// ---------------------------------------------------------------------------

async function submitJob(modelKey: string, params: Record<string, any>): Promise<string> {
  const model = MODELS[modelKey];
  if (!model) {
    console.error(`Unknown model '${modelKey}'. Available: ${Object.keys(MODELS).join(", ")}`);
    process.exit(1);
  }
  const endpoint = `/generate/${model.type}/${model.path}`;
  const res = await apiRequest("POST", endpoint, params);
  console.log(`Job submitted: ${res.job_id} (status: ${res.status})`);
  return res.job_id;
}

async function pollJob(jobId: string, intervalMs = 3000, maxWaitMs = 600_000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const job = await apiRequest("GET", `/jobs/${jobId}`);
    if (job.status === "completed") {
      return job;
    }
    if (job.status === "failed") {
      throw new Error(`Job failed: ${job.result?.error ?? "unknown error"}`);
    }
    if (job.status === "cancelled") {
      throw new Error("Job was cancelled.");
    }
    // queued or processing — wait and retry
    await Bun.sleep(intervalMs);
  }
  throw new Error(`Job ${jobId} timed out after ${maxWaitMs / 1000}s`);
}

async function downloadResult(urls: string[], outputPath: string): Promise<void> {
  const url = urls[0];
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download result: ${res.status}`);
  const buf = await res.arrayBuffer();
  await Bun.write(outputPath, buf);
  console.log(`Saved ${outputPath} (${(buf.byteLength / 1024).toFixed(1)} KB)`);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    model:     { type: "string", default: "z-image" },
    output:    { type: "string", short: "o", default: "scratch/output.png" },
    width:     { type: "string", default: "1024" },
    height:    { type: "string", default: "1024" },
    steps:     { type: "string" },
    seed:      { type: "string" },
    "image-url": { type: "string" },
    help:      { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
  strict: false,
});

if (values.help || positionals.length === 0) {
  console.log(`
Usage: bun run krea.ts "<prompt>" [options]

Options:
  --model MODEL       Model to use (default: z-image)
  --output, -o PATH   Output file path (default: output.png)
  --width N           Image width (default: 1024)
  --height N          Image height (default: 1024)
  --steps N           Inference steps (model-dependent)
  --seed N            Seed for reproducibility
  --image-url URL     Source image for img2img / upscaling
  -h, --help          Show this help

Models:
  Image:    ${Object.entries(MODELS).filter(([,v]) => v.type === "image").map(([k]) => k).join(", ")}
  Video:    ${Object.entries(MODELS).filter(([,v]) => v.type === "video").map(([k]) => k).join(", ")}
  Enhance:  ${Object.entries(MODELS).filter(([,v]) => v.type === "enhance").map(([k]) => k).join(", ")}
`);
  process.exit(0);
}

const prompt = positionals.join(" ");
const modelKey = values.model!;

// Build request body
const body: Record<string, any> = { prompt };
if (values.width)      body.width = parseInt(values.width);
if (values.height)     body.height = parseInt(values.height);
if (values.steps)      body.steps = parseInt(values.steps);
if (values.seed)       body.seed = parseInt(values.seed);
if (values["image-url"]) body.imageUrls = [values["image-url"]];

// Run
const jobId = await submitJob(modelKey, body);
const completed = await pollJob(jobId);

if (completed.result?.urls?.length) {
  // Ensure output directory exists
  const outDir = dirname(resolve(values.output!));
  const { mkdirSync } = await import("fs");
  mkdirSync(outDir, { recursive: true });
  await downloadResult(completed.result.urls, values.output!);
} else {
  console.log("Job completed but no result URLs returned.");
  console.log(JSON.stringify(completed, null, 2));
}
