import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Yazım denetimi (TDK) — kullanıcıya görünen metinlerde bilinen yanlış/tutarsız yazımların geri gelmesini engeller.
// Excel sütun adı eşleştirmeleri (…FileService.js, lokasyonMailService.js) ve sahte veri (data/) dışarıda bırakılır.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [];
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) { if (n !== "data") walk(p); }
    else if (/\.(jsx|js)$/.test(n) && !/\.test\./.test(n) && !/FileService\.js$/.test(n) && n !== "lokasyonMailService.js") files.push(p);
  }
};
walk(root);

// [yasak kalıp, doğrusu]
const BANNED = [
  [/\bMail Gönder\b/, "E-posta Gönder"], [/\bmail adresi\b/i, "e-posta adresi"], [/\bMail Listesi\b/, "E-posta Listesi"], [/\bmaili\b/, "e-posta(sı/yı)"],
  [/\bmailler(i|in)?\b/i, "e-postalar"], [/\bmail gönderildi\b/, "e-posta gönderildi"],
  [/Monitor Raporu/, "Monitör Raporu"], [/Veri Input/, "Veri Girişi"], [/Bitlocker Durumu/, "BitLocker Durumu"],
  [/\bTuruncuhat(?![A-Za-z.])/, "TuruncuHat"], [/Turuncuhattan/, "TuruncuHat'tan"], [/İsim Soyisim/, "Ad Soyad"], [/\b3\. parti\b/, "üçüncü taraf"],
  [/\bopsiyonel\b/, "isteğe bağlı"], [/raporu açılır/, "rapor açılır"],
];

test("Arayüz metinlerinde bilinen yazım hataları ve tutarsız yazımlar yok", () => {
  const problems = [];
  for (const f of files) {
    readFileSync(f, "utf8").split(/\r?\n/).forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
      const code = line.replace(/\s\/\/\s.*$/, ""); // satır sonu yorumlarını yok say
      for (const [re, fix] of BANNED) if (re.test(code)) problems.push(`${f.replace(root, "src")}:${i + 1} → "${fix}" olmalı: ${t.slice(0, 90)}`);
    });
  }
  assert.deepEqual(problems, []);
});

test("index.html dili Türkçe (büyük harf dönüşümü İ/ı kurallarına uysun)", () => {
  const html = readFileSync(join(root, "..", "index.html"), "utf8");
  assert.match(html, /<html[^>]*\blang="tr"/);
});
