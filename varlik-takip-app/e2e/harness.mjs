// Duman testi altyapısı: kullanıcının verisine DOKUNMADAN, geçici bir veri klasörüyle ayrı bir backend başlatır
// (demo dosyalar "imports" klasörüne kopyalanır), test için Master kullanıcı açar ve Edge'i (yüklü tarayıcı,
// ek indirme yok) başlatır. Frontend, backend'in servis ettiği dist build'idir (gerçek kullanım biçimi).
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
export const appDir = join(here, "..");
const backendDir = join(appDir, "..", "backend");
const require = createRequire(import.meta.url);
export const XLSX = createRequire(join(backendDir, "package.json"))("xlsx");

const EDGE_PATHS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
];

export function buildFrontend() {
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "build", "--logLevel", "error"], { cwd: appDir, stdio: "inherit", shell: process.platform === "win32" });
}

export async function startBackend({ port = 5055 } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "varlik-smoke-"));
  const imports = join(dataDir, "imports");
  mkdirSync(imports, { recursive: true });
  const demo = join(backendDir, "demo-data", "current");
  if (existsSync(demo)) cpSync(demo, imports, { recursive: true });

  const child = spawn(process.execPath, ["server.js"], {
    cwd: backendDir,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DATA_DIR: dataDir, ADMIN_USERNAME: "smoke-admin", ADMIN_PASSWORD: randomBytes(9).toString("hex") },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));

  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) break;
    } catch { /* henüz açılmadı */ }
    await new Promise((r) => setTimeout(r, 500));
    if (i === 59) throw new Error(`Test backend'i açılamadı:\n${log}`);
  }

  // test kullanıcısı (rastgele şifre, yalnızca bu geçici veri klasöründe geçerli)
  const password = randomBytes(12).toString("hex");
  const res = await fetch(`${base}/api/auth/setup-master`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "smoke", password }),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`Test kullanıcısı açılamadı: ${JSON.stringify(body)}`);

  return {
    base,
    token: body.token,
    dataDir,
    log: () => log,
    async stop() {
      child.kill();
      await new Promise((r) => setTimeout(r, 300));
      try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* Windows dosya kilidi — geçici klasör, önemsiz */ }
    },
  };
}

export async function launchBrowser() {
  const { chromium } = require("playwright-core");
  const executablePath = EDGE_PATHS.find((p) => existsSync(p));
  if (!executablePath) throw new Error("Edge/Chrome bulunamadı");
  return chromium.launch({ executablePath, headless: true });
}
