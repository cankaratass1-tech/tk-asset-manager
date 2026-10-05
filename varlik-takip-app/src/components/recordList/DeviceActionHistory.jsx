import { useState, useEffect } from "react";
import { deviceKeyOf } from "../../services/deviceActionService";
import { backendClient } from "../../services/backendClient";

// "Cihaz Aksiyon Geçmişi" (madde 5) — bir cihazla ilgili geçmiş aksiyonları kronolojik (en yeni
// üstte) gösterir: manuel notlar, gönderilen mailler, durum/ertele değişiklikleri, rapordan
// çıkma/girme (Faz 2). Kaynak: backend deviceActions logu + o cihaza giden mailHistory detayları.
// Veri yoksa sessizce "Kayıt yok" gösterir, uygulama hata vermez (madde 14).
export default function DeviceActionHistory({ row, mailHistory, styles, pal }) {
  const dk = deviceKeyOf(row);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!dk) { setEvents([]); return; }
    let cancelled = false;
    setLoading(true);
    backendClient
      .getDeviceActions(dk)
      .then((rows) => { if (!cancelled) setEvents(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setEvents([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dk]);

  // Bu cihaza gönderilmiş mailleri (Gönderim Geçmişi) de aksiyon olarak dahil et.
  const serialLc = String(row.serial || "").toLowerCase();
  const hostLc = String(row.hostname || "").toLowerCase();
  const mailEvents = (mailHistory || []).flatMap((h) => {
    const details = h.details || [];
    const hit = details.some((d) => {
      const blob = `${d.device || ""} ${d.deviceName || ""} ${d.recipientUser || ""} ${d.recipientEmail || d.to || ""}`.toLowerCase();
      return (serialLc && blob.includes(serialLc)) || (hostLc && blob.includes(hostLc));
    });
    if (!hit) return [];
    return [{
      ts: h.isoDate || h.date || "",
      type: "Mail",
      description: `${h.report || h.reportType || ""} maili gönderildi`,
      user: h.senderUsername || "",
      reportId: h.reportType || "",
      mailSubject: h.subject || "",
      status: h.status || "",
      source: "mailHistory",
    }];
  });

  const all = [...events, ...mailEvents].sort((a, b) => String(b.ts).localeCompare(String(a.ts)));

  const fmt = (ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? String(ts) : d.toLocaleString("tr-TR");
  };

  return (
    <div style={{ marginTop: 18, width: "100%" }}>
      <p style={{ ...styles.formLabel, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 12 }}>
        Cihaz Aksiyon Geçmişi
      </p>
      {loading && <p style={{ color: pal.inkSoft, fontSize: 13, margin: 0 }}>Yükleniyor…</p>}
      {!loading && all.length === 0 && (
        <p style={{ color: pal.inkSoft, fontSize: 13, margin: 0 }}>Bu cihaz için henüz aksiyon kaydı yok.</p>
      )}
      {!loading && all.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {all.map((e, i) => (
            <div key={i} style={{ padding: "9px 11px", borderRadius: 9, background: pal.fieldBg, fontSize: 12.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <span style={{ fontWeight: 700 }}>{e.type}</span>
                <span style={{ color: pal.inkSoft, fontSize: 11.5, flexShrink: 0 }}>{fmt(e.ts)}</span>
              </div>
              {e.description && <div style={{ marginTop: 2, lineHeight: 1.45 }}>{e.description}</div>}
              {e.mailSubject && <div style={{ marginTop: 2, color: pal.inkSoft }}>Konu: {e.mailSubject}</div>}
              <div style={{ marginTop: 3, color: pal.inkSoft, fontSize: 11.5, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {e.user && <span>👤 {e.user}</span>}
                {e.reportId && <span>📋 {e.reportId}</span>}
                {e.status && <span>Durum: {e.status}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
