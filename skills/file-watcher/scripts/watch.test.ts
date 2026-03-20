import { describe, test, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { spawn } from "bun";
import { writeFileSync, unlinkSync, mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";

const watchScript = join(import.meta.dir, "watch.ts");
const testDir = join(import.meta.dir, "..", "test-fixtures");

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Collect lines from the watcher process
async function startWatcher(
  files: string[],
  opts: string[] = []
): Promise<{ lines: () => string[]; kill: () => void }> {
  const proc = spawn({
    cmd: ["bun", "run", watchScript, ...opts, ...files],
    cwd: join(import.meta.dir, ".."),
    stdout: "pipe",
    stderr: "pipe",
  });

  const collected: string[] = [];
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Read stdout in background
  const readLoop = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop()!;
        for (const line of parts) {
          if (line.trim()) collected.push(line);
        }
      }
    } catch {
      // process killed
    }
  })();

  // Give watcher time to set up watches
  await sleep(300);

  return {
    lines: () => [...collected],
    kill: () => {
      proc.kill();
    },
  };
}

beforeEach(() => {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true });
  mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true });
});

describe("file creation (A)", () => {
  test("detects new file with small content", async () => {
    const f = join(testDir, "new.txt");
    const w = await startWatcher([f]);

    writeFileSync(f, "hello world");
    await sleep(400);

    const lines = w.lines();
    w.kill();

    expect(lines.length).toBeGreaterThanOrEqual(1);
    const added = lines.find((l) => l.startsWith("A"));
    expect(added).toBeDefined();
    expect(added).toContain("new.txt:1:1");
    expect(added).toContain("hello world");
  });

  test("detects new large file with size only", async () => {
    const f = join(testDir, "big.txt");
    const w = await startWatcher([f]);

    writeFileSync(f, "x".repeat(1000));
    await sleep(400);

    const lines = w.lines();
    w.kill();

    const added = lines.find((l) => l.startsWith("A"));
    expect(added).toBeDefined();
    expect(added).toContain("big.txt");
    // Large file: no location, just size
    expect(added).not.toContain("x".repeat(1000));
  });
});

describe("file modification (M)", () => {
  test("shows inline diff for small change", async () => {
    const f = join(testDir, "mod.css");
    writeFileSync(f, "color: red;\n");

    const w = await startWatcher([f]);

    writeFileSync(f, "color: blue;\n");
    await sleep(400);

    const lines = w.lines();
    w.kill();

    const mod = lines.find((l) => l.startsWith("M"));
    expect(mod).toBeDefined();
    // Should include line:char location pointing to the AFTER state
    expect(mod).toMatch(/mod\.css:\d+:\d+/);
    expect(mod).toContain("`color: red;`");
    expect(mod).toContain("`color: blue;`");
  });

  test("shows char count summary for large change", async () => {
    const f = join(testDir, "mod-big.txt");
    writeFileSync(f, "a".repeat(500) + "\n");

    const w = await startWatcher([f]);

    writeFileSync(f, "b".repeat(500) + "\n");
    await sleep(400);

    const lines = w.lines();
    w.kill();

    const mod = lines.find((l) => l.startsWith("M"));
    expect(mod).toBeDefined();
    // Should contain char count format, not the raw content
    expect(mod).toMatch(/\+\d+\s+-\d+\s+chars/);
  });
});

describe("file deletion (D)", () => {
  test("detects deleted file", async () => {
    const f = join(testDir, "doomed.txt");
    writeFileSync(f, "goodbye");

    const w = await startWatcher([f]);

    unlinkSync(f);
    await sleep(400);

    const lines = w.lines();
    w.kill();

    const del = lines.find((l) => l.startsWith("D"));
    expect(del).toBeDefined();
    expect(del).toContain("doomed.txt");
  });
});

describe("binary files", () => {
  test("shows binary size change", async () => {
    const f = join(testDir, "data.bin");
    const buf1 = Buffer.alloc(1024);
    buf1[0] = 0; // null byte = binary
    writeFileSync(f, buf1);

    const w = await startWatcher([f]);

    const buf2 = Buffer.alloc(2048);
    buf2[0] = 0;
    writeFileSync(f, buf2);
    await sleep(400);

    const lines = w.lines();
    w.kill();

    const mod = lines.find((l) => l.startsWith("M"));
    expect(mod).toBeDefined();
    expect(mod).toContain("binary");
    expect(mod).toContain("1.0KB");
    expect(mod).toContain("2.0KB");
  });
});

describe("debouncing", () => {
  test("collapses rapid writes into fewer events", async () => {
    const f = join(testDir, "rapid.txt");
    writeFileSync(f, "start\n");

    const w = await startWatcher([f]);

    // 20 writes in quick succession
    for (let i = 0; i < 20; i++) {
      writeFileSync(f, `write ${i}\n`);
      await sleep(5);
    }
    await sleep(500);

    const lines = w.lines();
    w.kill();

    // Should be far fewer than 20 events
    const mods = lines.filter((l) => l.startsWith("M"));
    expect(mods.length).toBeLessThan(10);
    expect(mods.length).toBeGreaterThanOrEqual(1);
  });
});

describe("location info", () => {
  test("reports correct line:char for mid-file change", async () => {
    const f = join(testDir, "loc.txt");
    writeFileSync(f, "line1\nline2\nline3\nline4\nline5\n");

    const w = await startWatcher([f]);

    // Change only line 3
    writeFileSync(f, "line1\nline2\nCHANGED\nline4\nline5\n");
    await sleep(400);

    const lines = w.lines();
    w.kill();

    const mod = lines.find((l) => l.startsWith("M"));
    expect(mod).toBeDefined();
    // Line 3 changed, first differing char is position 1 -> loc.txt:3:1
    expect(mod).toContain("loc.txt:3:1");
  });

  test("reports line range for multi-line change", async () => {
    const f = join(testDir, "range.txt");
    writeFileSync(f, "a\nb\nc\nd\ne\n");

    const w = await startWatcher([f]);

    // Change lines 2 through 4
    writeFileSync(f, "a\nB\nC\nD\ne\n");
    await sleep(400);

    const lines = w.lines();
    w.kill();

    const mod = lines.find((l) => l.startsWith("M"));
    expect(mod).toBeDefined();
    // Should show range 2:1-4
    expect(mod).toContain("range.txt:2:1-4");
  });

  test("reports char offset when change is mid-line", async () => {
    const f = join(testDir, "midline.txt");
    writeFileSync(f, "hello world\n");

    const w = await startWatcher([f]);

    writeFileSync(f, "hello earth\n");
    await sleep(400);

    const lines = w.lines();
    w.kill();

    const mod = lines.find((l) => l.startsWith("M"));
    expect(mod).toBeDefined();
    // "hello " is 6 chars, so char 7 is where 'w' vs 'e' diverges
    expect(mod).toContain("midline.txt:1:7");
  });
});

describe("threshold option", () => {
  test("--threshold controls inline diff cutoff", async () => {
    const f = join(testDir, "thresh.txt");
    writeFileSync(f, "a".repeat(50) + "\n");

    // Use a very small threshold
    const w = await startWatcher([f], ["--threshold", "10"]);

    writeFileSync(f, "b".repeat(50) + "\n");
    await sleep(400);

    const lines = w.lines();
    w.kill();

    const mod = lines.find((l) => l.startsWith("M"));
    expect(mod).toBeDefined();
    // With threshold=10, a 50-char change should be summarized
    expect(mod).toMatch(/\+\d+\s+-\d+\s+chars/);
  });
});
