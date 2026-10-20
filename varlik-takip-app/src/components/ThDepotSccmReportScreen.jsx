import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Pagination from "./Pagination";
import { computeThDepotSccmRows, EXCLUDED_CIDR } from "../services/thDepotSccmService";

const PAGE_SIZE = 50;
const norm = (v) => String(v ?? "").trim().toLowerCase();

const EXPORT_HEADERS = ["Cihaz (Hostname)", "Seri No", "IP", "TuruncuHat Durumu", "SCCM Durumu", "Son Kullanıcı", "Son Görülme", "Şirket", "Lokasyon", "Cihaz Türü", "Model", "Neden / Durum"];
const toExportRow = (r) => ({
  [EXPORT_HEADERS[0]]: r.hostname,
  [EXPORT_HEADERS[1]]: r.serial,
  [EXPORT_HEADERS[2]]: r.ip,
  [EXPORT_HEADERS[3]]: r.thStatus,
  [EXPORT_HEADERS[4]]: r.sccmStatus,
  [EXPORT_HEADERS[5]]: r.lastUser,
  [EXPORT_HEADERS[6]]: r.lastSeen,
  [EXPORT_HEADERS[7]]: r.company,
  [EXPORT_HEADERS[8]]: r.location,
  [EXPORT_HEADERS[9]]: r.deviceType,
  [EXPORT_HEADERS[10]]: r.model,
  [EXPORT_HEADERS[11]]: r.reason,
});
const sheetFrom = (rows) => XLSX.utils.json_to_sheet(rows.map(toExportRow), { header: EXPORT_HEADERS });
// Dosya/sayfa adlarında "/" ve ":" kullanılamadığı için aşama başına sabit, okunur adlar
const STAGE_EXPORT_NAMES = {
  depot: "Zimmet Depoda",
  sccmMatched: "SCCM Eşleşen",
  sccmActive: "SCCM Çalışıyor",
  excludedIp: "Çıkarılan - IP Bloğu",
  excludedMaterialOrder: "Çıkarılan - Malzeme Emri",
  final: "Rapor",
};
const dateTag =() => new Date().toLocaleDateString("tr-TR").replace(/\./g, "-");

// Ayarlar > Gizli/Gelişmiş Raporlar: "TuruncuHat Zimmet Depoda / SCCM Çalışıyor Raporu".
// Hesaplama thDepotSccmService.js'te; burası sadece gösterim. Üstteki aşama rozetleri tıklanabilir:
// seçilen aşamadaki (çıkarılanlar dahil) cihazlar tabloda listelenir.
export default function ThDepotSccmReportScreen({ styles, pal, thRows, sccmRows, thMeta, sccmMeta, loading, staleDays }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [stage, setStage] = useState("final");

  const { stages, stats } = useMemo(() => computeThDepotSccmRows({ thRows, sccmRows, staleDays }), [thRows, sccmRows, staleDays]);

  const filtered = useMemo(() => {
    const stageRows = stages[stage] || [];
    const q = norm(search);
    if (!q) return stageRows;
    return stageRows.filter((r) => [r.hostname, r.serial, r.ip, r.lastUser, r.company, r.location, r.model, r.reason].some((v) => norm(v).includes(q)));
  }, [stages, stage, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const missingData = thRows.length === 0 || sccmRows.length === 0;

  // [id, etiket, adet, çıkarılan aşama mı] — id null ise bilgi rozeti (liste yok)
  const funnel = [
    [null, "TuruncuHat toplam", stats.thTotal, false],
    ["depot", "Zimmet Depoda", stats.depot, false],
    ["sccmMatched", "SCCM'de eşleşen", stats.sccmMatched, false],
    ["sccmActive", "SCCM'de çalışıyor", stats.sccmActive, false],
    ["excludedIp", `${EXCLUDED_CIDR.base}/${EXCLUDED_CIDR.prefix} (çıkarıldı)`, stats.excludedIp, true],
    ["excludedMaterialOrder", "İşlemdeki Malzeme Emri (çıkarıldı)", stats.excludedMaterialOrder, true],
    ["final", "Rapordaki cihaz", stats.final, false],
  ];
  const headers = ["Cihaz (Hostname)", "Seri No", "IP", "TuruncuHat Durumu", "SCCM Durumu", "Son Kullanıcı", "Son Görülme", "Şirket", "Lokasyon", "Neden / Durum"];

  // Excel çıktısı: (1) ekrandaki liste (seçili aşama + arama), (2) tüm aşamaların sayfa sayfa dökümü
  const exportCurrent = () => {
    const label = STAGE_EXPORT_NAMES[stage] || "Liste";
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheetFrom(filtered), label);
    XLSX.writeFile(wb, `TuruncuHat Zimmet Depoda - SCCM Çalışıyor - ${label} - ${dateTag()}.xlsx`);
  };
  const exportAllStages = () => {
    const wb = XLSX.utils.book_new();
    const summary = funnel.map(([, label, n]) => ({ "Aşama": label, "Cihaz Sayısı": n }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Özet");
    XLSX.utils.book_append_sheet(wb, sheetFrom(stages.final), "Rapor");
    XLSX.utils.book_append_sheet(wb, sheetFrom(stages.excludedIp), "Çıkarılan - IP Bloğu");
    XLSX.utils.book_append_sheet(wb, sheetFrom(stages.excludedMaterialOrder), "Çıkarılan - Malzeme Emri");
    XLSX.utils.book_append_sheet(wb, sheetFrom(stages.depot), "Tüm Depoda Cihazlar");
    XLSX.writeFile(wb, `TuruncuHat Zimmet Depoda - SCCM Çalışıyor - Tüm Aşamalar - ${dateTag()}.xlsx`);
  };

  const selectStage = (id) => {
    setStage(id);
    setPage(1);
  };

  // Aşama rozeti ve aramayı varsayılana (Rapordaki cihazlar) döndürür
  const isFiltered = stage !== "final" || search !== "";
  const resetFilters = () => {
    setStage("final");
    setSearch("");
    setPage(1);
  };

  return (
    <div style={{ ...styles.panel, padding: "20px 24px" }}>
      <p style={styles.settingsSectionTitle}>TuruncuHat Zimmet Depoda / SCCM Çalışıyor Raporu</p>
      <p style={{ ...styles.pageSub, margin: "0 0 12px" }}>
        TuruncuHat'ta "Zimmet Depoda" görünen ama SCCM'de son {staleDays} gün içinde giriş yapılmış (çalışıyor) cihazlar.
        172.29.4.0/24 IP bloğundaki ve TuruncuHat'ta "İşlemdeki Malzeme Emri" olan cihazlar kapsam dışıdır; rozetlere tıklayarak çıkarılanları da görebilirsiniz.
      </p>
      <p style={{ fontSize: 12, color: pal.inkSoft, margin: "0 0 12px" }}>
        {thMeta ? `TuruncuHat: ${thMeta.fileName}` : "TuruncuHat: yüklenmedi"} · {sccmMeta ? `SCCM: ${sccmMeta.fileName}` : "SCCM: yüklenmedi"}
        {loading ? " · yükleniyor…" : ""}
      </p>

      {missingData && !loading ? (
        <p style={{ fontSize: 13, color: pal.inkSoft }}>
          Rapor için hem TuruncuHat hem SCCM dosyası gerekir. Ayarlar &gt; Veri Girişi &gt; Dosya Kaynağı klasörünü kontrol edin.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {funnel.map(([id, label, n, excluded]) => {
              const selected = id && id === stage;
              const base = id === "final" ? styles.badgeBad : excluded ? { background: pal.warnBg, color: pal.warnFg } : {};
              return (
                <span
                  key={label}
                  onClick={id ? () => selectStage(id) : undefined}
                  title={id ? "Bu aşamadaki cihazları listele" : undefined}
                  style={{
                    ...styles.badge,
                    ...base,
                    cursor: id ? "pointer" : "default",
                    outline: selected ? `2px solid ${pal.accent || pal.ink}` : "none",
                    outlineOffset: 1,
                    fontWeight: selected ? 700 : undefined,
                  }}
                >
                  {label}: {n}
                </span>
              );
            })}
          </div>

          <div style={styles.toolbar} className="no-print">
            <div style={styles.toolbarFiltersRow}>
              <div style={styles.searchWrap}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  placeholder="Hostname, seri no, IP, kullanıcı veya neden ara..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  style={styles.searchInput}
                />
                {search && (
                  <span
                    onClick={() => {
                      setSearch("");
                      setPage(1);
                    }}
                    title="Aramayı temizle"
                    style={{ cursor: "pointer", color: pal.inkSoft, fontSize: 14, lineHeight: 1, padding: "0 2px" }}
                  >
                    ×
                  </span>
                )}
              </div>
              {isFiltered && (
                <button type="button" style={styles.btnGhost} onClick={resetFilters} title="Aşama ve aramayı varsayılana döndürür">
                  Filtreleri Sıfırla
                </button>
              )}
              <button type="button" style={styles.btnGhost} onClick={exportCurrent} disabled={filtered.length === 0} title="Ekrandaki listeyi (seçili aşama ve arama) Excel'e aktarır">
                Excel'e Aktar ({filtered.length})
              </button>
              <button type="button" style={styles.btnGhost} onClick={exportAllStages} title="Rapor, çıkarılanlar ve tüm depoda cihazlar sayfa sayfa tek dosyada">
                Tüm Aşamaları Aktar
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {headers.map((h) => (
                    <th key={h} style={{ ...styles.th, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((r) => (
                  <tr key={`${stage}|${r.rowKey}`}>
                    <td style={styles.td}><span style={styles.serial}>{r.hostname}</span></td>
                    <td style={styles.td}>{r.serial}</td>
                    <td style={{ ...styles.td, whiteSpace: "nowrap" }}>{r.ip}</td>
                    <td style={styles.td}>{r.thStatus}</td>
                    <td style={styles.td}>{r.sccmStatus}</td>
                    <td style={styles.td}>{r.lastUser}</td>
                    <td style={{ ...styles.td, fontSize: 13, whiteSpace: "nowrap" }}>{r.lastSeen}</td>
                    <td style={styles.td}>{r.company}</td>
                    <td style={styles.td}>{r.location}</td>
                    <td style={{ ...styles.td, fontSize: 13 }}>{r.reason}</td>
                  </tr>
                ))}
                {paged.length === 0 && (
                  <tr>
                    <td style={{ ...styles.td, color: pal.inkSoft }} colSpan={headers.length}>Bu aşamada cihaz bulunamadı.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ ...styles.tableFooter, flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            <span>
              {filtered.length} kayıttan {paged.length} tanesi gösteriliyor{totalPages > 1 ? ` · Sayfa ${safePage} / ${totalPages}` : ""}
            </span>
            <Pagination page={safePage} totalPages={totalPages} onChange={setPage} styles={styles} pal={pal} />
          </div>
        </>
      )}
    </div>
  );
}
