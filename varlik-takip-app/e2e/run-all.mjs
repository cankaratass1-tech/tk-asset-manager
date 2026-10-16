// Tüm testleri sırayla çalıştırır ve tek özet tablo basar (ön yüz bir kez derlenir, e2e'ler --skip-build ile koşar).
//   npm run test:all
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { buildFrontend } from "./harness.mjs";

const SUITES = [
  ["Birim (frontend)", "node", ["--test", ...readdirSync("src/services").filter((f) => f.endsWith(".test.js")).map((f) => `src/services/${f}`)]],
  ["Backend (şema + demo veri tutarlılığı)", "npm", ["test", "--prefix", "../backend"], "backend"],
  ["Tüm ekran taraması", "node", ["e2e/sweep.mjs", "--skip-build"]],
  ["Veri değişimi → dashboard/rapor", "node", ["e2e/changecheck.mjs", "--skip-build"]],
  ["Duman testi", "node", ["e2e/smoke.mjs", "--skip-build"]],
  ["Mail", "node", ["e2e/mailtest.mjs", "--skip-build"]],
  ["Dashboard doğruluğu", "node", ["e2e/dashcheck.mjs", "--skip-build"]],
  ["Dashboard demo", "node", ["e2e/dashdemo.mjs", "--skip-build"]],
  ["Şirket filtresi", "node", ["e2e/companycheck.mjs", "--skip-build"]],
  ["Windows sürümü", "node", ["e2e/windowscheck.mjs", "--skip-build"]],
  ["Bottleneck", "node", ["e2e/darbogazcheck.mjs", "--skip-build"]],
  ["Cihaz geçmişi", "node", ["e2e/historycheck.mjs", "--skip-build"]],
  ["Açık bulgu trendi", "node", ["e2e/trendlegend.mjs", "--skip-build"]],
  ["Tema", "node", ["e2e/themecheck.mjs", "--skip-build"]],
  ["Kaydırma", "node", ["e2e/scrollcheck.mjs", "--skip-build"]],
];
buildFrontend();
const rows = [];
for (const [name, cmd, args, kind] of SUITES) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { encoding: "utf8", shell: cmd === "npm", maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  let summary = "";
  const m = out.match(/Sonuç: (\d+)\/(\d+)[^\n]*/) || out.match(/ℹ pass (\d+)[\s\S]*?ℹ fail (\d+)/);
  if (m && out.includes("Sonuç:")) summary = `${m[1]}/${m[2]}`;
  else if (m) summary = `${m[1]} geçti, ${m[2]} kaldı`;
  const ok = r.status === 0;
  rows.push({ name, ok, summary, sec: Math.round((Date.now() - t0) / 1000) });
  console.log(`${ok ? "✓" : "✗"} ${name.padEnd(40)} ${summary.padEnd(14)} ${Math.round((Date.now() - t0) / 1000)} sn`);
  if (!ok) console.log(out.split("\n").filter((l) => /✗|BAŞARISIZ|not ok|Error/.test(l)).slice(0, 8).join("\n"));
}
const bad = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - bad.length}/${rows.length} paket başarılı${bad.length ? ` — BAŞARISIZ: ${bad.map((b) => b.name).join(", ")}` : ""}`);
process.exit(bad.length ? 1 : 0);
