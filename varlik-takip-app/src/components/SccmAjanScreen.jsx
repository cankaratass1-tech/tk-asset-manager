import { useEffect, useMemo, useRef, useState } from "react";
import Pagination from "./Pagination";

// SCCM Ajan Raporu — kullanıcı isteği (bkz. konuşma): "Excel ile aynı yap her şeyi görelim
// sayfada". Ayrı bir dosya/kaynak DEĞİL, diğer raporların (Zimmet Uyuşmazlığı vb.) zaten
// kullandığı SCCM envanteri (realSccmAll) — ama burada mapSccmRow'un dönüştürdüğü/özetlediği
// alanlar değil, Excel'deki HAM sütunlar birebir gösteriliyor (rows prop = ham satırlar,
// sccmFileService.mapSccmRow'daki r._raw). Sütun listesi hardcode edilmiyor — ilk satırın
// anahtarlarından türetiliyor ki gerçek export'ta sütun değişirse sayfa otomatik uyum sağlasın.
const norm = (v) => String(v ?? "").trim().toLowerCase();
const PAGE_SIZE_OPTIONS = [25, 50, 100, Infinity];
// Excel'in AutoFilter açılır penceresi gibi — arama kutusuyla listeyi daraltabildiğin için
// sütunun kaç farklı değeri olduğu önemli değil (Hostname gibi neredeyse benzersiz sütunlarda
// bile çalışır). Sadece pencere içindeki checkbox listesi çok uzunsa (arama daraltılmadıysa)
// DOM'u şişirmemek için gösterimi sınırlıyoruz — bir önceki "sayfa bomboş beyaz kalıyor" sorunu
// tam da binlerce seçeneği HER ZAMAN render etmekten kaynaklanmıştı (bkz. konuşma).
const MAX_VISIBLE_OPTIONS = 300;

// Bir sütunun Excel AutoFilter'ı — başlığa tıklayınca açılan arama + checkbox listesi.
function ColumnFilterMenu({ pal, styles, column, allValues, selected, onChange, onClose }) {
  const [q, setQ] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [onClose]);

  const matching = useMemo(() => {
    const nq = norm(q);
    return nq ? allValues.filter((v) => norm(v.value).includes(nq)) : allValues;
  }, [allValues, q]);
  const visible = matching.slice(0, MAX_VISIBLE_OPTIONS);
  const allMatchingSelected = matching.length > 0 && matching.every((v) => selected.has(v.value));

  const toggleValue = (v) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next);
  };
  const toggleAllMatching = () => {
    const next = new Set(selected);
    if (allMatchingSelected) matching.forEach((v) => next.delete(v.value));
    else matching.forEach((v) => next.add(v.value));
    onChange(next);
  };

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        zIndex: 50,
        marginTop: 4,
        width: 220,
        background: pal.panelSolid || pal.panel,
        border: `1px solid ${pal.line}`,
        borderRadius: 8,
        boxShadow: pal.modalShadow || pal.shadow,
        padding: 8,
        whiteSpace: "normal",
        fontWeight: 400,
        color: pal.ink,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="text"
        autoFocus
        placeholder={`${column} içinde ara...`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ ...styles.formInput, width: "100%", fontSize: 12, padding: "5px 8px", marginBottom: 6 }}
      />
      <div
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "3px 2px", cursor: "pointer", borderBottom: `1px solid ${pal.line}`, marginBottom: 4 }}
        onClick={toggleAllMatching}
      >
        <input type="checkbox" readOnly checked={allMatchingSelected} style={{ margin: 0 }} />
        <strong>(Tümünü Seç)</strong>
      </div>
      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        {visible.map(({ value, count }) => (
          <div
            key={value}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "3px 2px", cursor: "pointer" }}
            onClick={() => toggleValue(value)}
          >
            <input type="checkbox" readOnly checked={selected.has(value)} style={{ margin: 0, flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={value}>{value}</span>
            <span style={{ color: pal.inkSoft, flexShrink: 0 }}>{count}</span>
          </div>
        ))}
        {matching.length > MAX_VISIBLE_OPTIONS && (
          <div style={{ fontSize: 12, color: pal.inkSoft, padding: "4px 2px" }}>
            {matching.length - MAX_VISIBLE_OPTIONS} değer daha var — daraltmak için ara
          </div>
        )}
        {matching.length === 0 && <div style={{ fontSize: 12, color: pal.inkSoft, padding: "4px 2px" }}>Sonuç yok</div>}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
        <button type="button" style={{ ...styles.btnGhost, padding: "3px 8px", fontSize: 12 }} onClick={() => onChange(new Set())}>
          Filtreyi Kaldır
        </button>
        <button type="button" style={{ ...styles.btnPrimary, padding: "3px 8px", fontSize: 12 }} onClick={onClose}>
          Tamam
        </button>
      </div>
    </div>
  );
}

export default function SccmAjanScreen({ styles, pal, rows, meta, loading, onLoadClick }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  // Sütun başına Excel AutoFilter mantığı: col -> seçili değerler Set'i. Set boşsa (ya da hiç
  // girdi yoksa) o sütunda filtre uygulanmaz — Set doluysa SADECE o değerler gösterilir.
  const [columnFilters, setColumnFilters] = useState({});
  const [openFilterCol, setOpenFilterCol] = useState(null);

  const columns = useMemo(() => (rows.length ? Object.keys(rows[0]) : []), [rows]);

  // Bir sütunun (diğer sütunlardaki aktif filtreler uygulanmış haliyle) değer + sayaç listesi —
  // Excel'de de bir sütunun filtre listesi diğer sütunlardaki filtrelerden etkilenir.
  const valuesForColumn = (col) => {
    const otherActive = Object.entries(columnFilters).filter(([c, set]) => c !== col && set && set.size > 0);
    const base = otherActive.length ? rows.filter((r) => otherActive.every(([c, set]) => set.has(String(r[c] ?? "").trim()))) : rows;
    const counts = new Map();
    base.forEach((r) => {
      const v = String(r[col] ?? "").trim();
      if (!v) return;
      counts.set(v, (counts.get(v) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value, "tr"));
  };

  const activeFilterCount = Object.values(columnFilters).filter((set) => set && set.size > 0).length;

  const setColumnFilter = (col, set) => {
    setColumnFilters((prev) => ({ ...prev, [col]: set }));
    setPage(1);
  };
  const clearColumnFilters = () => {
    setColumnFilters({});
    setPage(1);
  };

  const filtered = useMemo(() => {
    let list = rows;
    const activeCols = Object.entries(columnFilters).filter(([, set]) => set && set.size > 0);
    if (activeCols.length) {
      list = list.filter((r) => activeCols.every(([c, set]) => set.has(String(r[c] ?? "").trim())));
    }
    const q = norm(search);
    if (q) list = list.filter((r) => columns.some((c) => norm(r[c]).includes(q)));
    return list;
  }, [rows, columns, search, columnFilters]);

  const totalPages = pageSize === Infinity ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    if (pageSize === Infinity) return filtered;
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSize, safePage]);

  return (
    <>
      <div style={{ ...styles.panel, padding: "20px 24px" }}>
        <p style={styles.pageTitle}>SCCM Ajan Raporu</p>
        <p style={styles.pageSub}>
          {meta
            ? `${meta.fileName} (${new Date(meta.modifiedAt).toLocaleString("tr-TR")}) — ${rows.length} kayıt, Excel'deki tüm sütunlarla (${columns.length} sütun) birebir.`
            : "Henüz SCCM envanter dosyası yüklenmedi — aşağıdan yükleyin"}
        </p>
        <div style={{ ...styles.chipToggle, display: "inline-block", marginTop: 8 }} onClick={loading ? undefined : onLoadClick}>
          {loading ? "Yükleniyor..." : "📄 SharePoint'ten SCCM Envanterini Yükle"}
        </div>
      </div>

      {rows.length > 0 && (
        <div style={{ ...styles.panel, padding: "20px 24px" }}>
          <div style={styles.toolbar} className="no-print">
            <div style={styles.toolbarFiltersRow}>
              <div style={styles.searchWrap}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  placeholder="Herhangi bir sütunda ara..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  style={styles.searchInput}
                />
              </div>
              {activeFilterCount > 0 && (
                <button type="button" style={{ ...styles.btnGhost, padding: "4px 10px", fontSize: 12 }} onClick={clearColumnFilters}>
                  Sütun Filtrelerini Temizle ({activeFilterCount})
                </button>
              )}
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {columns.map((c) => {
                    const active = columnFilters[c] && columnFilters[c].size > 0;
                    return (
                      <th key={c} style={{ ...styles.th, whiteSpace: "nowrap", position: "relative" }}>
                        <div
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}
                          onClick={() => setOpenFilterCol(openFilterCol === c ? null : c)}
                        >
                          <span>{c}</span>
                          <span style={{ fontSize: 12, color: active ? pal.accent || pal.ok : pal.inkSoft }}>▾</span>
                        </div>
                        {openFilterCol === c && (
                          <ColumnFilterMenu
                            pal={pal}
                            styles={styles}
                            column={c}
                            allValues={valuesForColumn(c)}
                            selected={columnFilters[c] || new Set()}
                            onChange={(set) => setColumnFilter(c, set)}
                            onClose={() => setOpenFilterCol(null)}
                          />
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {paged.map((r, i) => (
                  <tr key={i}>
                    {columns.map((c) => (
                      <td key={c} style={{ ...styles.td, fontSize: 13, whiteSpace: "nowrap" }}>{r[c] || <span style={{ color: pal.inkSoft }}>—</span>}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length > PAGE_SIZE_OPTIONS[0] && (
            <div style={styles.segmented} title="Sayfada gösterilecek kayıt sayısı">
              {PAGE_SIZE_OPTIONS.map((n) => (
                <div key={n} onClick={() => { setPageSize(n); setPage(1); }} style={{ ...styles.seg, ...(pageSize === n ? styles.segActive : {}) }}>
                  {n === Infinity ? "Tümü" : n}
                </div>
              ))}
            </div>
          )}
          <div style={{ ...styles.tableFooter, flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            <span>
              {filtered.length} kayıttan {paged.length} tanesi gösteriliyor
              {rows.length !== filtered.length ? ` (filtre öncesi ${rows.length})` : ""}
              {pageSize !== Infinity && totalPages > 1 ? ` · Sayfa ${safePage} / ${totalPages}` : ""}
            </span>
            <Pagination page={safePage} totalPages={totalPages} onChange={setPage} styles={styles} pal={pal} />
          </div>
        </div>
      )}
    </>
  );
}
