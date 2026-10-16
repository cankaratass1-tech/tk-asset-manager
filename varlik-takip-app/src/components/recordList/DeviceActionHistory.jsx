import { useState, useEffect, useMemo } from "react";
import { deviceKeyOf } from "../../services/deviceActionService";
import { backendClient } from "../../services/backendClient";
import { REPORT_TYPES } from "../../data/constants";
import { deriveHistoryEvents, sourceUpdateEvent, HISTORY_CATEGORIES, categoryOf, CATEGORY_ICON } from "../../services/deviceHistoryService";

// "Cihaz Aksiyon Geçmişi" (madde 5) — bir cihazla ilgili geçmişi kronolojik (en yeni üstte) gösterir:
//  - kayıtlı aksiyonlar: manuel notlar, durum/ertele değişiklikleri (backend deviceActions logu)
//  - gönderilen mailler (Gönderim Geçmişi / mailHistory)
//  - TÜRETİLEN olaylar (otomatik etiketli): rapora girdi/çıktı ve zimmet devri (kimden → kime) — snapshot geçmişinden,
//    TuruncuHat "Son Güncelleme Tarihi" ile birlikte (bkz. deviceHistoryService.js). Türetilenler kaydedilmez, açılan cihaz için hesaplanır.
// Kategori çipleriyle süzülür, günlere göre gruplanır. Veri yoksa "Kayıt yok" gösterir, uygulama hata vermez (madde 14).
const reportLabel = (id) => REPORT_TYPES.find((r) => r.id === id)?.name || id;

export default function DeviceActionHistory({ row, mailHistory, styles, pal }) {
  const dk = deviceKeyOf(row);
  const [events, setEvents] = useState([]);
  const [timeline, setTimeline] = useState({});
  const [loading, setLoading] = useState(false);
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState(null);
  const [showAll, setShowAll] = useState(false); // tüm geçmiş açılır pencerede (panelde yalnız son 3 kayıt)

  useEffect(() => {
    if (!dk) { setEvents([]); setTimeline({}); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      backendClient.getDeviceActions(dk).catch(() => []),
      backendClient.getDeviceTimeline(dk).catch(() => ({})),
    ])
      .then(([rows, tl]) => {
        if (cancelled) return;
        setEvents(Array.isArray(rows) ? rows : []);
        setTimeline(tl && typeof tl === "object" && !tl.error ? tl : {});
      })
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

  const derived = useMemo(() => {
    const list = deriveHistoryEvents(timeline, { ownerUpdatedAt: row.ownerUpdatedAt, reportLabel });
    const src = sourceUpdateEvent({ ownerUpdatedAt: row.ownerUpdatedAt, owner: row.ownerFull || row.owner });
    return src ? [...list, src] : list;
  }, [timeline, row.ownerUpdatedAt, row.ownerFull, row.owner]);

  const all = [...events, ...mailEvents, ...derived].sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  const counts = HISTORY_CATEGORIES.reduce((m, [id]) => ({ ...m, [id]: id === "all" ? all.length : all.filter((e) => categoryOf(e.type) === id).length }), {});
  const shown = cat === "all" ? all : all.filter((e) => categoryOf(e.type) === cat);

  const dayOf = (ts) => {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? "Tarihsiz" : d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
  };
  // Yalnız tarih içeren kaynaklar (TuruncuHat gün bilgisi) için saat göstermek yanıltıcı olur
  const dateOnly = (ts) => /^d{4}-d{2}-d{2}(T00:00:00(.000)?Z)?$/.test(String(ts));
  const timeOf = (ts) => {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) || dateOnly(ts) ? "" : d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  };
  const groups = [];
  shown.forEach((e) => {
    const day = dayOf(e.ts);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  });

  const PREVIEW = 3;
  const preview = all.slice(0, PREVIEW);

  const eventCard = (e, key) => {
    const c = categoryOf(e.type);
    const derivedEvt = e.source === "snapshot" || e.source === "TuruncuHat";
    const expandable = Boolean(e.mailSubject);
    return (
      <div key={key} data-history-event={c}
        onClick={expandable ? () => setOpen(open === key ? null : key) : undefined}
        style={{ padding: "9px 11px", borderRadius: 9, background: pal.fieldBg, fontSize: 12.5, borderLeft: `3px solid ${c === "zimmet" ? pal.accent : c === "mail" ? pal.ok : c === "rapor" ? pal.warnFg : pal.neutralDot}`, cursor: expandable ? "pointer" : "default" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
          <span style={{ fontWeight: 700 }}>
            {CATEGORY_ICON[c]} {e.type}
            {derivedEvt && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: pal.inkSoft, border: `1px solid ${pal.line}`, borderRadius: 8, padding: "0 5px" }} title={e.source === "TuruncuHat" ? "TuruncuHat kaynak dosyasından" : "Snapshot geçmişinden otomatik türetildi"}>{e.source === "TuruncuHat" ? "kaynak" : "otomatik"}</span>}
          </span>
          <span style={{ color: pal.inkSoft, fontSize: 11.5, flexShrink: 0 }}>{timeOf(e.ts)}</span>
        </div>
        {e.description && <div style={{ marginTop: 2, lineHeight: 1.45 }}>{e.description}</div>}
        {e.mailSubject && (
          <div style={{ marginTop: 2, color: pal.inkSoft, ...(open === key ? {} : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }) }}>
            Konu: {e.mailSubject}
          </div>
        )}
        <div style={{ marginTop: 3, color: pal.inkSoft, fontSize: 11.5, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {e.ts && <span>🕒 {dayOf(e.ts)}</span>}
          {e.user && <span>👤 {e.user}</span>}
          {e.reportId && <span>📋 {reportLabel(e.reportId)}</span>}
          {e.status && <span>Durum: {e.status}</span>}
        </div>
      </div>
    );
  };

  return (
    <div style={{ marginTop: 18, width: "100%" }} data-action-history>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, margin: "0 0 8px" }}>
        <p style={{ ...styles.formLabel, margin: 0, textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 12 }}>
          Cihaz Aksiyon Geçmişi{all.length > 0 ? ` (${all.length})` : ""}
        </p>
        {all.length > PREVIEW && (
          <span onClick={() => setShowAll(true)} data-history-open style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, color: pal.accent }}>
            Tümünü gör ↗
          </span>
        )}
      </div>
      {loading && <p style={{ color: pal.inkSoft, fontSize: 13, margin: 0 }}>Yükleniyor…</p>}
      {!loading && all.length === 0 && (
        <p style={{ color: pal.inkSoft, fontSize: 13, margin: 0 }}>Bu cihaz için henüz aksiyon kaydı yok.</p>
      )}
      {!loading && all.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }} data-history-preview>
          {preview.map((e, i) => eventCard(e, `p-${i}`))}
          {all.length > PREVIEW && (
            <span onClick={() => setShowAll(true)} style={{ cursor: "pointer", fontSize: 12, color: pal.inkSoft, padding: "2px 2px" }}>
              + {all.length - PREVIEW} kayıt daha — tümünü açılan pencerede gör
            </span>
          )}
        </div>
      )}

      {showAll && (
        <div style={{ ...styles.modalOverlay, zIndex: 80 }} onClick={(e) => { e.stopPropagation(); setShowAll(false); }} data-history-modal>
          <div style={{ ...styles.modalCard, width: "min(640px, 100%)", fontSize: 14 }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <p style={styles.modalTitle}>Cihaz Aksiyon Geçmişi</p>
              <span style={styles.modalClose} onClick={() => setShowAll(false)} data-history-close>✕</span>
            </div>
            <p style={styles.modalSub}>{row.serial}{row.hostname ? ` · ${row.hostname}` : ""} — {all.length} kayıt</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "4px 0 12px" }}>
              {HISTORY_CATEGORIES.filter(([id]) => id === "all" || counts[id] > 0).map(([id, label]) => (
                <span key={id} onClick={() => setCat(id)} data-history-chip={id}
                  style={{ cursor: "pointer", fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 14, border: `1px solid ${cat === id ? pal.accent : pal.line}`, background: cat === id ? pal.accentSoft : "transparent", color: cat === id ? pal.accent : pal.inkSoft }}>
                  {label} ({counts[id]})
                </span>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }} data-history-full>
              {groups.map((g) => (
                <div key={g.day}>
                  <div data-history-day style={{ fontSize: 11, fontWeight: 700, color: pal.inkSoft, textTransform: "uppercase", letterSpacing: "0.05em", margin: "8px 0 4px" }}>{g.day}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {g.items.map((e, i) => eventCard(e, `${g.day}-${i}`))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
