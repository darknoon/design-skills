#!/usr/bin/env bun

/**
 * Stress test for file-watcher.
 *
 * Exercises: rapid writes, large writes, binary files, file creation,
 * file deletion, and rapid alternating content.
 */

import { writeFileSync, unlinkSync, mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";

const testDir = join(import.meta.dir, "..", "test-fixtures");

// Clean slate
if (existsSync(testDir)) rmSync(testDir, { recursive: true });
mkdirSync(testDir, { recursive: true });

const textFile = join(testDir, "rapid.txt");
const bigFile = join(testDir, "big.json");
const binaryFile = join(testDir, "data.bin");
const createDelete = join(testDir, "ephemeral.txt");
const tinyFile = join(testDir, "tiny.css");

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log("=== Stress test starting ===");
  console.log(`Test dir: ${testDir}`);
  console.log(`Watch these files:`);
  console.log(`  ${textFile}`);
  console.log(`  ${bigFile}`);
  console.log(`  ${binaryFile}`);
  console.log(`  ${createDelete}`);
  console.log(`  ${tinyFile}`);
  console.log();

  // --- Phase 1: Rapid small writes (should debounce) ---
  console.log("Phase 1: Rapid small writes (20 writes in ~200ms)");
  writeFileSync(textFile, "initial content\n");
  await sleep(200); // let watcher pick up creation

  for (let i = 0; i < 20; i++) {
    writeFileSync(textFile, `rapid write ${i}\nline2: ${Date.now()}\n`);
    await sleep(10); // 10ms between writes
  }
  await sleep(300); // let debounce settle

  // --- Phase 2: Tiny inline-diffable change ---
  console.log("Phase 2: Small change (should show inline diff)");
  writeFileSync(tinyFile, "body { color: red; }\n");
  await sleep(200);
  writeFileSync(tinyFile, "body { color: blue; }\n");
  await sleep(300);

  // --- Phase 3: Large content change ---
  console.log("Phase 3: Large content change (should show char counts)");
  const bigContent: Record<string, unknown> = {};
  for (let i = 0; i < 500; i++) {
    bigContent[`key_${i}`] = `value_${i}_${"x".repeat(50)}`;
  }
  writeFileSync(bigFile, JSON.stringify(bigContent, null, 2));
  await sleep(300);

  // Modify a chunk of it
  bigContent["key_0"] = "CHANGED";
  bigContent["key_499"] = "ALSO_CHANGED";
  writeFileSync(bigFile, JSON.stringify(bigContent, null, 2));
  await sleep(300);

  // --- Phase 4: Binary file ---
  console.log("Phase 4: Binary file creation and modification");
  const buf1 = Buffer.alloc(4096);
  for (let i = 0; i < buf1.length; i++) buf1[i] = Math.floor(Math.random() * 256);
  writeFileSync(binaryFile, buf1);
  await sleep(300);

  // Grow it
  const buf2 = Buffer.alloc(8192);
  for (let i = 0; i < buf2.length; i++) buf2[i] = Math.floor(Math.random() * 256);
  writeFileSync(binaryFile, buf2);
  await sleep(300);

  // --- Phase 5: Create and delete ---
  console.log("Phase 5: File creation then deletion");
  writeFileSync(createDelete, "I exist briefly!\n");
  await sleep(300);
  unlinkSync(createDelete);
  await sleep(300);

  // --- Phase 6: Burst of writes to multiple files simultaneously ---
  console.log("Phase 6: Simultaneous writes to multiple files");
  for (let i = 0; i < 5; i++) {
    writeFileSync(textFile, `burst ${i}\n`);
    writeFileSync(tinyFile, `.cls-${i} { margin: ${i}px; }\n`);
    await sleep(20);
  }
  await sleep(500);

  console.log("\n=== Stress test complete ===");
}

run();
