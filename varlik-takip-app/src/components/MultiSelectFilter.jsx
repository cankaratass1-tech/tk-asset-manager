import { useEffect, useMemo, useRef, useState } from "react";

// Genel amaçlı çoklu seçim dropdown'u (gereksinim #3 — Model filtresi ve benzerleri için; ayrıca
// kullanıcı isteğiyle Tür/Lokasyon filtreleri de aynı bileşene taşındı). İçinde arama kutusu var
// (Lokasyon gibi 70+ seçenekli listelerde aramadan bulmak zor oluyordu — bkz. konuşma). Mevcut
// dropdown görünümüyle tutarlı olsun diye styles.scheduleSelect/formInput/panel/checkbox
// token'ları kullanılır (özel bir stil sistemi icat edilmez).
export default function MultiSelectFilter({ label, options, selected, onChange, styles, pal, placeholder }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLocaleLowerCase("tr");
    return options.filter((opt) => opt.toLocaleLowerCase("tr").includes(q));
  }, [options, query]);

  if (!options || options.length === 0) return null;

  const toggle = (opt) => {
    if (selected.includes(opt)) onChange(selected.filter((s) => s !== opt));
    else onChange([...selected, opt]);
  };

  const summary = selected.length === 0 ? `${label} (Tümü)` : selected.length === 1 ? selected[0] : `${label} (${selected.length})`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ ...styles.scheduleSelect, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, userSelect: "none" }}
        title={selected.join(", ") || undefined}
      >
        <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</span>
        <span style={{ fontSize: 10, color: pal.inkSoft }}>▾</span>
      </div>
      {open && (
        <div
          style={{
            ...styles.panel,
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 30,
            minWidth: 240,
            maxHeight: 340,
            display: "flex",
            flexDirection: "column",
            padding: "8px 6px",
          }}
        >
          {options.length > 6 && (
            <input
              type="text"
              autoFocus
              placeholder={placeholder || `${label} ara...`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              style={{ ...styles.formInput, marginBottom: 6, flexShrink: 0 }}
            />
          )}
          {selected.length > 0 && (
            <div
              onClick={() => onChange([])}
              style={{ fontSize: 12.5, color: pal.accent, cursor: "pointer", padding: "6px 10px", fontWeight: 600, flexShrink: 0 }}
            >
              Temizle ({selected.length})
            </div>
          )}
          <div style={{ overflowY: "auto" }}>
            {filteredOptions.length === 0 && (
              <div style={{ padding: "8px 10px", fontSize: 13, color: pal.inkSoft }}>Sonuç yok</div>
            )}
            {filteredOptions.map((opt) => (
              <label
                key={opt}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", fontSize: 13.5, cursor: "pointer", borderRadius: 6 }}
              >
                <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} style={styles.checkbox} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
