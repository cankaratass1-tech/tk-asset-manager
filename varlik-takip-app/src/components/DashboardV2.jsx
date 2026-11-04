import { useEffect, useMemo, useState } from "react";
import { backendClient } from "../services/backendClient";
import { combinedPeriodSummary } from "../services/dashboardOverviewService";
import { FINDING_META } from "../services/dashboardNav";
import TrendChart from "./TrendChart";
import TrendDetailModal from "./TrendDetailModal";

// DEMO — yeni Ana Sayfa tasarımı (günlük operasyon + yönetici bakışı). Eski dashboard'un yedeği:
// git etiketi "dashboard-yedek-2026-10-16" ve ../dashboard-yedek-2026-10-16 klasörü. Henüz commit edilmedi.
//
// Katmanlar: (1) yönetici özeti cümlesi + sağlık skoru + 5 anahtar sayı (dönem farkıyla), (2) "Bugün aksiyon gerekenler"
// öncelik listesi, (3) bulgu dağılımı + trend, (4) lokasyon sıcak noktaları, (5) veri tazeliği. Her kart ilgili rapora gider.
// Hesaplamalar App.jsx'te (aynı canlı veriden, şirket filtresine uyar); burada yalnızca sunum var.

const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("tr-TR"));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export default function DashboardV2({ styles, pal, data, snapshots, company, summaryToggle, searchSlot, onNavigate, onBack, onExec, onV3, onExecDash }) {
  const [recs, setRecs] = useState([]);
  useEffect(() => {
    backendClient.getNewInstalls().then((r) => setRecs(Array.isArray(r?.records) ? r.records : [])).catch(() => {});
  }, []);

  const { cards, extra, totals } = data;
  const sev = { high: { c: pal.bad, l: "Yüksek" }, mid: { c: pal.warnFg, l: "Orta" }, low: { c: pal.inkSoft, l: "Bilgi" } };

  // Kapatma onayı: mail gitmiş, teslim edilmemiş; 7 günü geçenler "gecikmiş"
  const closure = useMemo(() => {
    const pending = recs.filter((r) => r.mailSentAt && String(r.status || "").toLocaleUpperCase("tr-TR") !== "TESLİM EDİLDİ");
    const overdue = pending.filter((r) => (Date.now() - Date.parse(r.mailSentAt)) / 86400000 > 7).length;
    return { pending: pending.length, overdue };
  }, [recs]);

  // Öncelik listesi: önem derecesi sabit (güvenlik/kayıt bütünlüğü > kapasite > bilgi), aynı derecede sayıya göre
  const actions = useMemo(() => {
    const items = [
      cards.disk.value != null && { id: "disk", sev: "high", n: cards.disk.value, title: "Kritik disk alanı", desc: "Boş alanı ≤10 GB olan diskler", to: "disk", opts: { segment: "critical" } },
      { id: "zimmet", sev: "high", n: cards.zimmet.value, title: "Hatalı zimmet", desc: "Zimmetli kişi ile cihazı kullanan farklı / mükerrer", to: "zimmet", opts: { segment: "unmatched" } },
      { id: "closure", sev: closure.overdue > 0 ? "high" : "mid", n: closure.overdue || closure.pending, title: closure.overdue > 0 ? "Kapatma onayı geciken kayıtlar" : "Kapatma onayı bekleyen kayıtlar", desc: closure.overdue > 0 ? `7 günü geçti (toplam ${closure.pending} bekleyen)` : "Kullanıcı TuruncuHat'tan onay verecek", to: "kapatma-onayi" },
      { id: "monitor", sev: "mid", n: cards.zimmet.monitor, title: "Monitör uyuşmazlığı", desc: "Kişi başkasına zimmetli monitörü kullanıyor", to: "zimmet", opts: { segment: "monitorIssue" } },
      { id: "bilgidisi", sev: "mid", n: cards.atil.bilgiDisi, title: "Bilgi dışı kullanılan monitör", desc: "Zimmetli kişi dışında biri kullanıyor", to: "atil-monitor", opts: { atilStage: "outside" } },
      { id: "inaktif", sev: "mid", n: cards.inaktif.value, title: "İnaktif cihaz sahibi", desc: "Kayıtlı sahibi inaktif olan cihazlar", to: "inaktif" },
      { id: "lokip", sev: "mid", n: extra.lokasyonIp, title: "Lokasyon / IP uyuşmazlığı", desc: "Hostname'in ofisi ile gerçek IP farklı", to: "lokasyon-ip", opts: { segment: "unmatched" } },
      { id: "bsod", sev: "mid", n: extra.bsod, title: "BSOD olayları", desc: "Mavi ekran hatası alan cihazlar", to: "bsod" },
      { id: "bant", sev: "mid", n: extra.bantWarn, title: "Bant genişliği uyarısı", desc: "Ortalamanın altına düşen hatlar", to: "bant-genisligi" },
      { id: "unused", sev: "low", n: cards.unused.value, title: "Kullanılmayan cihaz", desc: "Zimmetli ama SCCM'de görünmüyor / uzun süredir giriş yok", to: "kullanilmayan" },
      { id: "atil", sev: "low", n: cards.atil.value, title: "Atıl monitör", desc: "Zimmetli ama kullanılmıyor", to: "atil-monitor", opts: { atilStage: "atil" } },
      { id: "battery", sev: "low", n: extra.batteryReplace, title: "Batarya değişimi", desc: "Sağlığı %60'ın altında", to: "battery-health", opts: { status: "Değişmeli" } },
    ].filter(Boolean).filter((a) => a.n > 0);
    const order = { high: 0, mid: 1, low: 2 };
    return items.sort((a, b) => order[a.sev] - order[b.sev] || b.n - a.n);
  }, [cards, extra, closure]);

  // Bulgu dağılımı (açık bulgular, kategori başına)
  const dist = [
    { id: "zimmet", v: cards.zimmet.value },
    { id: "inaktif", v: cards.inaktif.value },
    { id: "kullanilmayan", v: cards.unused.value },
    ...(cards.disk.value != null ? [{ id: "disk", v: cards.disk.value }] : []),
  ].map((d) => ({ ...d, k: FINDING_META[d.id].label, c: FINDING_META[d.id].color }));
  const distTotal = dist.reduce((s, d) => s + d.v, 0);

  // Trend (açık bulgu, dönem dönem) — şirket filtresine uyar, Disk şirket seçiliyken hariç
  const [trendMode, setTrendMode] = useState("month"); // day | week | month | raw
  const [detailIdx, setDetailIdx] = useState(null);
  const [hoverDist, setHoverDist] = useState(null);
  const trend = useMemo(() => combinedPeriodSummary(snapshots, trendMode, { company }), [snapshots, company, trendMode]);
  const series = trend.series.map((s) => ({ label: s.label, v: s.acikBulgu, rate: s.cozumOrani }));
  const trendKeys = dist.map((d) => d.id);

  // Yönetici özeti: tek cümlede durum
  const delta = ["inaktif", "zimmet", "disk", "unused"].map((k) => cards[k].summary).filter(Boolean);
  const newSum = delta.reduce((s, x) => s + x.yeniTespit, 0);
  const solvedSum = delta.reduce((s, x) => s + x.cozulen, 0);
  const top = [...dist].sort((a, b) => b.v - a.v)[0];
  const healthTone = totals.healthPct >= 80 ? pal.ok : totals.healthPct >= 60 ? pal.warnFg : pal.bad;
  const summaryText = [
    `${data.scope} için cihaz sağlığı %${totals.healthPct}.`,
    top && top.v > 0 ? `En çok açık bulgu: ${top.k} (${fmt(top.v)}).` : "Açık bulgu yok.",
    delta.length ? `Son dönemde ${fmt(solvedSum)} bulgu çözüldü, ${fmt(newSum)} yeni bulgu eklendi.` : "Dönemsel karşılaştırma için veri birikiyor.",
    closure.overdue > 0 ? `${closure.overdue} kapatma onayı 7 günü geçti.` : "",
  ].filter(Boolean).join(" ");

  const card = { ...styles.panel, padding: "18px 20px", margin: 0 };
  const label = { fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: pal.inkSoft };
  const chip = (txt, color, bg) => <span style={{ fontSize: 12, fontWeight: 700, color, background: bg, borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap" }}>{txt}</span>;

  const Kpi = ({ title, value, tone, sub, summary, to, opts, na }) => (
    <div
      onClick={to ? () => onNavigate(to, opts) : undefined}
      style={{ ...card, cursor: to ? "pointer" : "default", display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}
      title={to ? "Rapora git" : undefined}
    >
      <span style={label}>{title}</span>
      <span style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.05, fontFamily: "var(--font-mono)", color: na ? pal.inkSoft : tone || pal.ink }}>{na ? "—" : fmt(value)}</span>
      <span style={{ fontSize: 13, color: pal.inkSoft, minHeight: 18 }}>{na ? "şirket bazında ayrılamaz" : sub}</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", minHeight: 24 }}>
        {summary ? (
          <>
            {chip(`+${fmt(summary.yeniTespit)} yeni`, pal.bad, `${pal.bad}1e`)}
            {chip(`−${fmt(summary.cozulen)} çözülen`, pal.ok, pal.okBg || `${pal.ok}1e`)}
          </>
        ) : null}
      </div>
    </div>
  );

  // Sağlık halkası
  const R = 46, C = 2 * Math.PI * R;
  const ring = (
    <svg width="132" height="132" viewBox="0 0 120 120" style={{ flexShrink: 0 }}>
      <circle cx="60" cy="60" r={R} fill="none" stroke={pal.fieldBg || pal.line} strokeWidth="11" />
      <circle cx="60" cy="60" r={R} fill="none" stroke={healthTone} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(totals.healthPct / 100) * C} ${C}`} transform="rotate(-90 60 60)" />
      <text x="60" y="58" textAnchor="middle" style={{ fontSize: 26, fontWeight: 700, fill: pal.ink, fontFamily: "var(--font-mono)" }}>%{totals.healthPct}</text>
      <text x="60" y="76" textAnchor="middle" style={{ fontSize: 12, fill: pal.inkSoft, fontWeight: 600, letterSpacing: "0.06em" }}>SAĞLIK</text>
    </svg>
  );

  const bars = (items, color, to, opts = {}) => {
    const m = Math.max(1, ...items.map((i) => i.count));
    return items.length === 0 ? (
      <span style={{ fontSize: 13, color: pal.inkSoft }}>Kayıt yok</span>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {items.map((it) => (
          <div
            key={it.key}
            onClick={to ? () => onNavigate(to, { location: it.key, ...opts }) : undefined}
            style={{ cursor: to ? "pointer" : "default", padding: "4px 6px", margin: "-4px -6px", borderRadius: 8 }}
            title={to ? `${it.key} — ${fmt(it.count)} cihazı raporda göster` : undefined}
            onMouseEnter={(e) => { if (to) e.currentTarget.style.background = pal.accentSoft; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
              <span style={{ fontWeight: 600 }}>{it.key}</span>
              <span style={{ color: pal.inkSoft, fontFamily: "var(--font-mono)" }}>{fmt(it.count)}</span>
            </div>
            <div style={{ height: 7, borderRadius: 4, background: pal.fieldBg || pal.line }}>
              <div style={{ width: `${Math.round((it.count / m) * 100)}%`, height: "100%", borderRadius: 4, background: color }} />
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {searchSlot}

      {/* Başlık + yönetici özeti */}
      <div style={{ ...card, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
        {ring}
        <div style={{ flex: "1 1 360px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <p style={{ ...styles.pageTitle, margin: 0 }}>Operasyon Panosu</p>
            {chip(data.scope, pal.accent, pal.accentSoft)}
            {chip("YENİ GÖRÜNÜM", pal.accent, pal.accentSoft)}
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 16, lineHeight: 1.5, color: pal.ink }}>{summaryText}</p>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: pal.inkSoft }}>
            {fmt(totals.devices)} cihazın {fmt(totals.problemDevices)}'inde sorun var · {fmt(totals.open)} açık bulgu{totals.outsideInventory ? ` (${fmt(totals.outsideInventory)} bulgu SCCM envanteri dışında)` : ""}{data.diskScoped ? "" : " (Disk şirket bazında ayrılamadığı için dahil değil)"}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: pal.inkSoft }}>Kıyas dönemi:</span>
            {summaryToggle}
          </div>
          {onExecDash && <button style={styles.btnPrimary} data-open-exec onClick={onExecDash} title="Üst yönetim için Operasyonel Durum Özeti">📈 Yönetici ekranı</button>}
          <button style={onExecDash ? styles.btnGhost : styles.btnPrimary} onClick={onExec}>📊 Yönetici özeti (tek sayfa)</button>
          {onV3 && <button style={styles.btnGhost} onClick={onV3} title="Örnek görünümlerden esinlenen taslak Ana Sayfa">🎨 V3 taslağını dene</button>}
          <button style={styles.btnGhost} onClick={onBack}>← Eski görünüme dön</button>
        </div>
      </div>

      {/* Anahtar sayılar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
        <Kpi title="Hatalı zimmet" value={cards.zimmet.value} tone={cards.zimmet.value ? pal.bad : pal.ok} sub={`Toplam ${fmt(cards.zimmet.total)} = ${fmt(cards.zimmet.ok)} doğru + ${fmt(cards.zimmet.value)} hatalı + ${fmt(cards.zimmet.unverified)} doğrulanamadı${cards.zimmet.obs ? ` + ${fmt(cards.zimmet.obs)} OBS` : ""}`} summary={cards.zimmet.summary} to="zimmet" opts={{ segment: "unmatched" }} />
        <Kpi title="İnaktif cihaz" value={cards.inaktif.value} tone={cards.inaktif.value ? pal.warnFg : pal.ok} sub="sahibi inaktif" summary={cards.inaktif.summary} to="inaktif" />
        <Kpi title="Kritik disk" value={cards.disk.value} tone={cards.disk.value ? pal.bad : pal.ok} sub={cards.disk.value == null ? "" : `${fmt(cards.disk.warning)} birim uyarı seviyesinde`} summary={cards.disk.summary} to="disk" opts={{ segment: "critical" }} na={cards.disk.value == null} />
        <Kpi title="Kullanılmayan" value={cards.unused.value} tone={cards.unused.value ? pal.warnFg : pal.ok} sub="zimmetli, kullanılmıyor" summary={cards.unused.summary} to="kullanilmayan" />
        <Kpi title="Atıl monitör" value={cards.atil.value} tone={cards.atil.value ? pal.warnFg : pal.ok} sub={`${fmt(cards.atil.bilgiDisi)} bilgi dışı kullanım`} to="atil-monitor" opts={{ atilStage: "atil" }} />
      </div>

      {/* Aksiyon listesi + dağılım */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, alignItems: "start" }}>
        <div style={{ ...card, gridColumn: "span 2", minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <p style={styles.settingsSectionTitle}>Bugün aksiyon gerekenler</p>
            <span style={{ fontSize: 13, color: pal.inkSoft }}>{actions.length} başlık · önem derecesine göre</span>
          </div>
          {actions.length === 0 ? (
            <p style={{ ...styles.pageSub, margin: "10px 0 0" }}>Şu an aksiyon gerektiren bulgu yok.</p>
          ) : (
            <div style={{ marginTop: 6 }}>
              {actions.map((a) => (
                <div
                  key={a.id}
                  data-action={a.id}
                  onClick={() => onNavigate(a.to, a.opts)}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 4px", borderTop: `1px solid ${pal.line}`, cursor: "pointer" }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: sev[a.sev].c, flexShrink: 0 }} title={`Önem: ${sev[a.sev].l}`} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{a.title}</div>
                    <div style={{ fontSize: 13, color: pal.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.desc}</div>
                  </div>
                  {chip(sev[a.sev].l, sev[a.sev].c, `${sev[a.sev].c}1a`)}
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 18, minWidth: 54, textAlign: "right" }}>{fmt(a.n)}</span>
                  <span style={{ color: pal.accent, fontSize: 13, fontWeight: 700 }}>Aç →</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <div style={{ ...card, minWidth: 0 }}>
          <p style={styles.settingsSectionTitle}>Açık bulgu dağılımı</p>
          <div style={{ display: "flex", height: 14, borderRadius: 8, overflow: "hidden", background: pal.fieldBg || pal.line, marginTop: 8 }}>
            {dist.map((d) => (
              <div key={d.k} data-dist-bar={d.id} role="button" tabIndex={0} aria-label={`${d.k}: ${d.v} kayıt, raporu aç`} title={`${d.k}: ${d.v} — raporu aç`}
                onClick={() => onNavigate(FINDING_META[d.id].to, FINDING_META[d.id].opts)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate(FINDING_META[d.id].to, FINDING_META[d.id].opts); } }}
                onMouseEnter={() => setHoverDist(d.id)} onMouseLeave={() => setHoverDist(null)}
                style={{ width: `${pct(d.v, distTotal)}%`, background: d.c, cursor: "pointer", opacity: hoverDist && hoverDist !== d.id ? 0.55 : 1, transition: "opacity .12s" }} />
            ))}
          </div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 2 }}>
            {dist.map((d) => (
              <div key={d.k} data-dist-row={d.id} role="button" tabIndex={0} aria-label={`${d.k}: ${d.v} kayıt, raporu aç`} title="Raporu aç"
                onClick={() => onNavigate(FINDING_META[d.id].to, FINDING_META[d.id].opts)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate(FINDING_META[d.id].to, FINDING_META[d.id].opts); } }}
                onMouseEnter={() => setHoverDist(d.id)} onMouseLeave={() => setHoverDist(null)}
                style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, cursor: "pointer", padding: "6px 8px", borderRadius: 8, background: hoverDist === d.id ? pal.accentSoft : "transparent" }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: d.c }} />
                <span style={{ flex: 1 }}>{d.k}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{fmt(d.v)}</span>
                <span style={{ color: pal.inkSoft, minWidth: 40, textAlign: "right" }}>%{pct(d.v, distTotal)}</span>
                <span style={{ color: pal.accent, fontSize: 13, fontWeight: 700 }}>→</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: pal.inkSoft, margin: "12px 0 0" }}>Bir cihaz birden fazla kategoride yer alabilir. Bir satıra tıklayınca o bulguların rapor açılır.</p>
        </div>
        <div style={{ ...card, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <p style={styles.settingsSectionTitle}>Açık bulgu trendi</p>
            {series.length >= 2 && (() => {
              const last = series[series.length - 1], prev = series[series.length - 2];
              const d = last.v - prev.v;
              return chip(`${d > 0 ? "▲ +" : d < 0 ? "▼ " : "▬ "}${fmt(d)} önceki döneme göre${last.rate != null ? ` · çözüm oranı %${last.rate}` : ""}`, d > 0 ? pal.bad : d < 0 ? pal.ok : pal.inkSoft, `${d > 0 ? pal.bad : d < 0 ? pal.ok : pal.inkSoft}1a`);
            })()}
          </div>
          <TrendChart series={trend.series} keys={trendKeys} meta={FINDING_META} stacked={false} mode={trendMode} onModeChange={(m) => { setTrendMode(m); setDetailIdx(null); }}
            onPointClick={setDetailIdx} accent={pal.accent}
            tone={{ ink: pal.ink, sub: pal.inkSoft, mute: pal.inkSoft, grid: pal.line, tipBg: pal.toastBg, tipFg: pal.toastFg }} />
          {detailIdx != null && trend.series[detailIdx] && (
            <TrendDetailModal item={trend.series[detailIdx]} prev={trend.series[detailIdx - 1]} keys={trendKeys} meta={FINDING_META} company={company}
              onClose={() => setDetailIdx(null)} onOpenReport={(id) => { setDetailIdx(null); onNavigate(FINDING_META[id].to, FINDING_META[id].opts); }} styles={styles} pal={pal} />
          )}
        </div>

        </div>
      </div>

      {/* Lokasyon sıcak noktaları */}
      <div style={{ ...card, minWidth: 0 }}>
        <p style={styles.settingsSectionTitle}>Lokasyonlar</p>
        <p style={{ ...styles.pageSub, margin: "2px 0 0" }}>Bir lokasyona tıklayınca o başlıktaki cihazlar raporda o lokasyonla filtrelenmiş açılır.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 28, marginTop: 8 }}>
          <div>
            <p style={{ ...label, margin: "0 0 10px" }}>Zimmet uyuşmazlığı</p>
            {bars(data.locations.zimmet.slice(0, 5), "#E5484D", "zimmet", { segment: "unmatched" })}
          </div>
          <div>
            <p style={{ ...label, margin: "0 0 10px" }}>İnaktif cihaz</p>
            {bars(data.locations.inaktif.slice(0, 5), "#F5A524", "inaktif")}
          </div>
        </div>
      </div>

      {/* Veri tazeliği */}
      <div style={{ ...card, padding: "12px 20px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={label}>Veri tazeliği</span>
        {data.freshness.map((f) => (
          <span key={f.label} title={f.file || ""} style={{ fontSize: 12, color: pal.inkSoft, background: pal.fieldBg || pal.line, borderRadius: 20, padding: "4px 11px" }}>
            {f.label}: <strong style={{ color: pal.ink }}>{f.at ? when(f.at) : "yüklenmedi"}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
