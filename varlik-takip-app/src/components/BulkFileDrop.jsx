import { useRef, useState } from "react";

// Ayarlar > Veri Girişi: tüm rapor dosyalarını tek seferde bırakma alanı. Türleri otomatik tanınır (bkz. services/fileDetect.js).
const STATUS = {
  ok: { icon: "✓", label: "Yüklendi" },
  skip: { icon: "–", label: "Atlandı" },
  unknown: { icon: "?", label: "Tanınmadı" },
  error: { icon: "✗", label: "Hata" },
  wait: { icon: "…", label: "İşleniyor" },
};

export default function BulkFileDrop({ pal, busy, results, onFiles, onClear }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const pick = (list) => { if (list && list.length && !busy) onFiles(Array.from(list)); };
  const colorOf = (s) => (s === "ok" ? pal.ok : s === "error" || s === "unknown" ? pal.bad : pal.inkSoft);

  return (
    <div data-bulk-drop>
      <div
        data-bulk-zone
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
        style={{
          border: `2px dashed ${over ? pal.accent : pal.line}`, borderRadius: 12, padding: "28px 20px", textAlign: "center",
          cursor: busy ? "progress" : "pointer", background: over ? pal.accentSoft : "transparent", marginTop: 12,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: pal.ink }}>{busy ? "Dosyalar işleniyor…" : "Tüm Excel / CSV dosyalarını buraya bırakın"}</div>
        <div style={{ fontSize: 12.5, color: pal.inkSoft, marginTop: 6 }}>
          ya da tıklayıp birden fazla dosya seçin — her dosyanın hangi rapora ait olduğu otomatik tanınır ve ilgili yere eklenir
        </div>
        <input ref={inputRef} type="file" multiple accept=".xlsx,.csv" data-bulk-input style={{ display: "none" }}
          onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      </div>
      {results.length > 0 && (
        <div style={{ marginTop: 14 }} data-bulk-results>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12.5, color: pal.inkSoft }}>
              {results.filter((r) => r.status === "ok").length} / {results.length} dosya eklendi
            </span>
            {!busy && <button onClick={onClear} style={{ background: "none", border: "none", color: pal.inkSoft, cursor: "pointer", fontSize: 12.5 }}>Listeyi temizle</button>}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: pal.inkSoft }}>
                <th style={{ padding: "6px 8px" }}>Dosya</th><th style={{ padding: "6px 8px" }}>Tanınan rapor</th><th style={{ padding: "6px 8px" }}>Durum</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={`${r.name}-${i}`} data-bulk-row={r.status} style={{ borderTop: `1px solid ${pal.line}` }}>
                  <td style={{ padding: "7px 8px", wordBreak: "break-all" }}>{r.name}</td>
                  <td style={{ padding: "7px 8px" }}>{r.label || "—"}{r.via ? <span style={{ color: pal.inkSoft, fontSize: 11.5 }}> (tanıma: {r.via})</span> : null}</td>
                  <td style={{ padding: "7px 8px", color: colorOf(r.status) }}>
                    <strong>{STATUS[r.status]?.icon} {STATUS[r.status]?.label}</strong>
                    {r.detail ? <div style={{ fontSize: 12, fontWeight: 400 }}>{r.detail}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
