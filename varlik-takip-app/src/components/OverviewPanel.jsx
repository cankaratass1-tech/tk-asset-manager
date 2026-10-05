import { useMemo } from "react";
import Donut from "./Donut";
import Gauge from "./Gauge";
import { combinedPeriodSummary, waterfallSegments, pctChange } from "../services/dashboardOverviewService";

const PERIOD_LABELS = { month: "Aylık", week: "Haftalık", raw: "Her Yükleme" };
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("tr-TR"));

// Her kart kendi renk ailesinde (bkz. konuşma / referans dashboardlar).
const C = {
  blue: "#2563EB",
  teal: "#0D9488",
  indigo: "#6366F1",
  amber: "#D97706",
  navy: "#1E3A5F",
  slate: "#64748B",
  emerald: "#10B981",
  coral: "#EF6C6C",
  purple: ["#7C3AED", "#9F67F0", "#B98DF3", "#D3B6F7"],
};

function Spark({ values, color, width = 120, height = 32 }) {
  const nums = (values || []).filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (nums.length < 2) return <div style={{ height, width }} />;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const xs = (i) => (i / (nums.length - 1)) * (width - 2) + 1;
  const ys = (v) => height - 3 - ((v - min) / span) * (height - 6);
  const line = nums.map((v, i) => `${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(" ");
  const area = `${xs(0).toFixed(1)},${height} ${line} ${xs(nums.length - 1).toFixed(1)},${height}`;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polygon points={area} fill={color} opacity="0.14" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function DeltaTag({ value, unit = "%", goodWhenNegative = true, pal }) {
  if (value == null) return null;
  const good = value === 0 ? null : goodWhenNegative ? value < 0 : value > 0;
  const color = good == null ? pal.inkSoft : good ? pal.ok : pal.bad;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color, marginLeft: 6 }}>
      {value > 0 ? "▲ +" : value < 0 ? "▼ " : "▬ "}
      {value}
      {unit}
    </span>
  );
}

export default function OverviewPanel({ snapshots, period, setPeriod, live, styles, pal }) {
  const summary = useMemo(() => combinedPeriodSummary(snapshots, period), [snapshots, period]);
  const { series, latest, prev, enough } = summary;

  const wf = useMemo(
    () =>
      waterfallSegments({
        toplamCihaz: live.toplamCihaz,
        inaktif: live.inaktif,
        zimmetHatali: live.zimmetHatali,
        kritikDisk: live.kritikDisk,
        kullanilmayan: live.kullanilmayan,
      }),
    [live]
  );
  const temiz = wf[wf.length - 1].value;
  const saglikPct = live.toplamCihaz ? Math.round((temiz / live.toplamCihaz) * 100) : 0;
  const zToplam = live.zimmetDogru + live.zimmetHatali;
  const zimmetUyumPct = zToplam ? Math.round((live.zimmetDogru / zToplam) * 100) : 0;
  const cozumOrani = latest && latest.cozumOrani != null ? latest.cozumOrani : null;
  const acikBulguLive = live.inaktif + live.zimmetHatali + live.kritikDisk + live.kullanilmayan;

  const cats = [
    { key: "İnaktif Cihaz", value: live.inaktif, color: C.purple[0] },
    { key: "Zimmet Hatalı", value: live.zimmetHatali, color: C.purple[1] },
    { key: "Kritik Disk", value: live.kritikDisk, color: C.purple[2] },
    { key: "Kullanılmayan", value: live.kullanilmayan, color: C.purple[3] },
  ];
  const catTotal = cats.reduce((s, c) => s + c.value, 0) || 1;
  const catMax = Math.max(...cats.map((c) => c.value), 1);

  const trendRows = useMemo(() => series.slice(1), [series]); // ilk dönemin öncesi yok
  const latestTrend = trendRows[trendRows.length - 1] || null;
  const prevTrend = trendRows[trendRows.length - 2] || null;

  // "Cihaz Sağlığı Durumu" — Toplam Cihaz'dan problem kategorileri çıkarılıp Temiz Cihaz'a
  // ulaşılır. Grafik yerine: tek yığılı çubuk (kompozisyon) + çıkarma tablosu (anlaşılır).
  // (Başlık "Şelale/waterfall" idi — kart gerçek bir waterfall grafiği çizmediği için kullanıcı
  // isteğiyle değiştirildi, bkz. konuşma.)
  const healthRows = [
    { key: "Toplam Cihaz", value: live.toplamCihaz, sign: "", color: C.slate, bold: true },
    { key: "İnaktif Cihaz", value: live.inaktif, sign: "−", color: C.coral },
    { key: "Zimmet Hatalı", value: live.zimmetHatali, sign: "−", color: C.coral },
    { key: "Kritik Disk", value: live.kritikDisk, sign: "−", color: C.coral },
    { key: "Kullanılmayan", value: live.kullanilmayan, sign: "−", color: C.coral },
    { key: "Temiz Cihaz", value: temiz, sign: "=", color: C.emerald, bold: true },
  ];
  const stackSegs = [
    { key: "Temiz", value: temiz, color: C.emerald },
    { key: "İnaktif", value: live.inaktif, color: "#F4A0A0" },
    { key: "Zimmet Hatalı", value: live.zimmetHatali, color: C.coral },
    { key: "Kritik Disk", value: live.kritikDisk, color: "#E0533A" },
    { key: "Kullanılmayan", value: live.kullanilmayan, color: "#B23B27" },
  ];
  const stackTotal = stackSegs.reduce((s, x) => s + x.value, 0) || 1;

  // --- ortak parçalar ---
  const Card = ({ title, accent, span, children, pad = 16 }) => (
    <div
      style={{
        gridColumn: `span ${span}`,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        border: `1px solid ${pal.line}`,
        borderRadius: 14,
        background: pal.panelSolid || pal.panel,
        boxShadow: pal.shadow,
        padding: pad,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
        <span style={{ width: 24, height: 3, borderRadius: 2, background: accent }} />
        <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: pal.ink }}>{title}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );

  const okColor = (v) => (v == null ? pal.inkSoft : v >= 50 ? C.emerald : v >= 25 ? C.amber : C.coral);

  return (
    <div style={{ ...styles.panel, padding: "22px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        <div>
          <p style={styles.settingsSectionTitle}>Genel Durum</p>
          <p style={{ ...styles.pageSub, margin: 0 }}>Cihaz envanteri sağlık özeti ve IT operasyon performansı — her ölçüt kendi grafiği ve renginde</p>
        </div>
        <div style={styles.segmented}>
          {Object.entries(PERIOD_LABELS).map(([id, l]) => (
            <div key={id} onClick={() => setPeriod(id)} style={{ ...styles.seg, ...(period === id ? styles.segActive : {}) }}>
              {l}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 16 }}>
        {/* ---- Satır 1: Sağlık özeti + 2 gösterge ---- */}
        <Card title="Envanter Sağlığı" accent={C.blue} span={4}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Donut
              size={128}
              thickness={18}
              segments={[
                { value: temiz, color: C.emerald, label: "Temiz" },
                { value: Math.max(0, live.toplamCihaz - temiz), color: C.coral, label: "Problemli" },
              ]}
              trackColor={pal.fieldBg}
              centerLabel={`%${saglikPct}`}
              centerSub="sağlıklı"
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minWidth: 0 }}>
              <div>
                <div style={{ fontSize: 11, color: pal.inkSoft, fontWeight: 600 }}>Toplam Cihaz</div>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "monospace", color: C.blue }}>{fmt(live.toplamCihaz)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: pal.inkSoft, fontWeight: 600 }}>Açık Bulgu</div>
                <div style={{ display: "flex", alignItems: "baseline" }}>
                  <span style={{ fontSize: 22, fontWeight: 800, fontFamily: "monospace", color: C.coral }}>{fmt(latest ? latest.acikBulgu : acikBulguLive)}</span>
                  <DeltaTag value={latest && prev ? pctChange(latest.acikBulgu, prev.acikBulgu) : null} unit="%" pal={pal} />
                </div>
                <Spark values={series.map((s) => s.acikBulgu)} color={C.coral} width={150} />
              </div>
            </div>
          </div>
        </Card>

        <Card title="Çözüm Oranı" accent={C.teal} span={4}>
          <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
            <Gauge
              value={cozumOrani ?? 0}
              centerLabel={cozumOrani != null ? `%${cozumOrani}` : "veri yok"}
              centerSub={latest ? `${fmt(latest.cozulen)} çözülen / ${fmt(latest.cozulen + latest.devam)} önceki problem` : "en az 2 dönem gerekli"}
              pal={pal}
              size={210}
            />
          </div>
        </Card>

        <Card title="Zimmet Uyumu" accent={C.indigo} span={4}>
          <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
            <Gauge
              value={zimmetUyumPct}
              bands={[
                { upTo: 75, color: C.coral },
                { upTo: 90, color: "#F2C037" },
                { upTo: 100, color: C.indigo },
              ]}
              centerLabel={`%${zimmetUyumPct}`}
              centerSub={`${fmt(live.zimmetDogru)} doğru / ${fmt(live.zimmetHatali)} hatalı`}
              pal={pal}
              size={210}
            />
          </div>
        </Card>

        {/* ---- Satır 2: Bulgu dağılımı (donut + detaylı tablo) ---- */}
        <Card title="Açık Bulgu Dağılımı" accent={C.purple[0]} span={5}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, flex: 1 }}>
            <Donut
              size={150}
              thickness={20}
              segments={cats.map((c) => ({ value: c.value, color: c.color, label: c.key }))}
              trackColor={pal.fieldBg}
              centerLabel={fmt(acikBulguLive)}
              centerSub="açık bulgu"
            />
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: pal.inkSoft, fontSize: 11 }}>
                  <th style={{ textAlign: "left", padding: "4px 6px", fontWeight: 600 }}>Kategori</th>
                  <th style={{ textAlign: "right", padding: "4px 6px", fontWeight: 600 }}>Adet</th>
                  <th style={{ textAlign: "right", padding: "4px 6px", fontWeight: 600 }}>Pay</th>
                  <th style={{ width: "34%", padding: "4px 6px" }} />
                </tr>
              </thead>
              <tbody>
                {cats.map((c) => (
                  <tr key={c.key} style={{ borderTop: `1px solid ${pal.line}` }}>
                    <td style={{ padding: "6px 6px" }}>
                      <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: c.color, marginRight: 7 }} />
                      {c.key}
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 6px", fontWeight: 700, fontFamily: "monospace" }}>{fmt(c.value)}</td>
                    <td style={{ textAlign: "right", padding: "6px 6px", color: pal.inkSoft }}>%{Math.round((c.value / catTotal) * 100)}</td>
                    <td style={{ padding: "6px 6px" }}>
                      <div style={{ height: 7, borderRadius: 4, background: pal.fieldBg }}>
                        <div style={{ height: "100%", width: `${Math.round((c.value / catMax) * 100)}%`, background: c.color, borderRadius: 4 }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ---- Satır 2: Cihaz Sağlık Şelalesi (yığılı çubuk + çıkarma tablosu) ---- */}
        <Card title="Cihaz Sağlığı Durumu" accent={C.slate} span={7}>
          <p style={{ ...styles.pageSub, margin: "0 0 12px", fontSize: 11.5 }}>
            Toplam cihazdan problem kategorileri çıkarılınca kalan "temiz" cihaz (bir cihaz birden çok kategoride olabilir)
          </p>

          {/* Tek yığılı çubuk — kompozisyon */}
          <div style={{ display: "flex", height: 26, borderRadius: 6, overflow: "hidden", border: `1px solid ${pal.line}` }}>
            {stackSegs.map((s) => {
              const w = (s.value / stackTotal) * 100;
              return (
                <div key={s.key} title={`${s.key}: ${fmt(s.value)}`} style={{ width: `${w}%`, background: s.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {w > 8 && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#fff" }}>{fmt(s.value)}</span>}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, color: pal.inkSoft, margin: "8px 0 14px" }}>
            {stackSegs.map((s) => (
              <span key={s.key}>
                <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: s.color, marginRight: 5 }} />
                {s.key} <strong style={{ color: pal.ink }}>%{Math.round((s.value / stackTotal) * 100)}</strong>
              </span>
            ))}
          </div>

          {/* Çıkarma tablosu */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <tbody>
              {healthRows.map((r, i) => (
                <tr key={r.key} style={{ borderTop: i === 0 ? "none" : `1px solid ${pal.line}`, background: r.bold ? pal.fieldBg : "transparent" }}>
                  <td style={{ padding: "8px 8px", width: 26, textAlign: "center", color: r.color, fontWeight: 800 }}>{r.sign}</td>
                  <td style={{ padding: "8px 8px", fontWeight: r.bold ? 800 : 500 }}>{r.key}</td>
                  <td style={{ padding: "8px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: r.bold ? 800 : 600, color: r.bold ? r.color : pal.ink }}>
                    {fmt(r.value)}
                  </td>
                  <td style={{ padding: "8px 8px", textAlign: "right", color: pal.inkSoft, width: 60 }}>
                    %{Math.round((r.value / (live.toplamCihaz || 1)) * 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ ...styles.pageSub, margin: "10px 0 0", fontSize: 11 }}>
            Sağlıklı cihaz oranı: <strong style={{ color: saglikPct >= 80 ? C.emerald : saglikPct >= 60 ? C.amber : C.coral }}>%{saglikPct}</strong>
          </p>
        </Card>

        {/* ---- Satır 3: Dönemsel Çözüm Performansı — donut + detaylı tablo ---- */}
        <Card title={`${PERIOD_LABELS[period]} Çözüm Performansı`} accent={C.navy} span={12}>
          {enough && latestTrend ? (
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: pal.ink }}>{latestTrend.label} dönemi</span>
                <Donut
                  size={168}
                  thickness={24}
                  segments={[
                    { value: latestTrend.cozulen, color: C.emerald, label: "Çözülen" },
                    { value: latestTrend.devam, color: C.slate, label: "Devam Eden" },
                    { value: latestTrend.yeni, color: C.coral, label: "Yeni Tespit" },
                  ]}
                  trackColor={pal.fieldBg}
                  centerLabel={latestTrend.cozumOrani != null ? `%${latestTrend.cozumOrani}` : "—"}
                  centerSub="çözüm oranı"
                />
                <div style={{ display: "flex", gap: 12, fontSize: 11.5, color: pal.inkSoft, flexWrap: "wrap", justifyContent: "center" }}>
                  <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: C.emerald, marginRight: 4 }} />Çözülen</span>
                  <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: C.slate, marginRight: 4 }} />Devam Eden</span>
                  <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: C.coral, marginRight: 4 }} />Yeni Tespit</span>
                </div>
                {prevTrend && prevTrend.cozumOrani != null && latestTrend.cozumOrani != null && (
                  <span style={{ fontSize: 12 }}>
                    Önceki dönem <strong>%{prevTrend.cozumOrani}</strong>
                    <DeltaTag value={Math.round((latestTrend.cozumOrani - prevTrend.cozumOrani) * 10) / 10} unit=" pp" goodWhenNegative={false} pal={pal} />
                  </span>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 320, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ color: pal.inkSoft, fontSize: 11 }}>
                      <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>Dönem</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600 }}>Açık Bulgu</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, color: C.emerald }}>Çözülen</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600 }}>Devam Eden</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, color: C.coral }}>Yeni Tespit</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600 }}>Çözüm Oranı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendRows.map((p) => (
                      <tr key={p.label} style={{ borderTop: `1px solid ${pal.line}` }}>
                        <td style={{ padding: "8px 8px", fontWeight: 700 }}>{p.label}</td>
                        <td style={{ padding: "8px 8px", textAlign: "right", fontFamily: "monospace" }}>{fmt(p.acikBulgu)}</td>
                        <td style={{ padding: "8px 8px", textAlign: "right", fontFamily: "monospace", color: C.emerald, fontWeight: 700 }}>{fmt(p.cozulen)}</td>
                        <td style={{ padding: "8px 8px", textAlign: "right", fontFamily: "monospace" }}>{fmt(p.devam)}</td>
                        <td style={{ padding: "8px 8px", textAlign: "right", fontFamily: "monospace", color: C.coral, fontWeight: 700 }}>{fmt(p.yeni)}</td>
                        <td style={{ padding: "8px 8px", textAlign: "right" }}>
                          <span style={{ fontFamily: "monospace", fontWeight: 800, color: okColor(p.cozumOrani) }}>{p.cozumOrani != null ? `%${p.cozumOrani}` : "—"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ ...styles.pageSub, margin: "8px 0 0", fontSize: 11 }}>
                  Çözüm Oranı = Çözülen ÷ (Çözülen + Devam Eden) — önceki dönemdeki problemli cihazların yüzde kaçı listeden düştü.
                </p>
              </div>
            </div>
          ) : (
            <p style={{ ...styles.pageSub, margin: 0 }}>En az 2 dönem verisi gerekli — snapshot geçmişi biriktikçe dolacak.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
