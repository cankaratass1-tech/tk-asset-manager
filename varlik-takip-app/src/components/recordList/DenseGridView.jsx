import { useMemo, useState } from "react";
import { STATUS_COLORS } from "../../data/constants";
import { deviceKeyOf } from "../../services/deviceActionService";

// Yoğun ızgara görünümü — sabit satır yüksekliği, sol durum şeridi, isme göre sıralama
export default function DenseGridView({
  rows,
  isZimmet,
  ownerLabel,
  serialLabel,
  modelLabel,
  locationLabel,
  styles,
  pal,
  rowKeyOf,
  selectedKeys,
  toggleSelect,
  allSelected,
  toggleSelectAll,
  rowMeta,
  cycleStatus,
  setNote,
  toggleSnooze,
  setSelectedPerson,
  detailRowKey,
  setDetailRowKey,
}) {
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => (sortAsc ? 1 : -1) * a.owner.localeCompare(b.owner, "tr"));
    return copy;
  }, [rows, sortAsc]);

  const cols = isZimmet
    ? "3px 28px 1.6fr 110px 1fr 130px 110px 210px"
    : "3px 28px 1.8fr 120px 1fr 130px 110px";

  const stripeColor = (r) => {
    // Disk Alanı — "matched" bu raporda hep true (eşleşme kavramı yok, bkz. diskFileService.js),
    // gerçek renk diskLevel'dan okunmalı yoksa "Kritik" satırları bile yeşil görünüyordu.
    if (r.diskLevel) return r.diskLevel === "critical" ? pal.bad : r.diskLevel === "warning" ? pal.warnFg : pal.ok;
    if (r.matched) return pal.ok;
    if (r.statusTag === "Kullanım Kaydı Yok") return pal.neutralDot;
    return pal.bad;
  };

  return (
    <div>
      <div style={{ ...styles.denseRow, gridTemplateColumns: cols, borderBottom: `1px solid ${pal.line}` }}>
        <div />
        <div style={styles.denseTh}>
          <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={styles.checkbox} />
        </div>
        <div style={{ ...styles.denseTh, ...styles.denseThSortable }} onClick={() => setSortAsc((v) => !v)}>
          {isZimmet ? "ZİMMETLİ KİŞİ" : (ownerLabel || "CİHAZ SAHİBİ").toLocaleUpperCase("tr-TR")} {sortAsc ? "↓" : "↑"}
        </div>
        <div style={styles.denseTh}>{(serialLabel || "SERİ NO").toLocaleUpperCase("tr-TR")}</div>
        <div style={styles.denseTh}>{isZimmet ? "TÜR" : (modelLabel || "MODEL").toLocaleUpperCase("tr-TR")}</div>
        <div style={styles.denseTh}>{isZimmet ? "KULLANAN" : (locationLabel || "LOKASYON").toLocaleUpperCase("tr-TR")}</div>
        <div style={styles.denseTh}>DURUM</div>
        {isZimmet && <div style={styles.denseTh}>İŞLEM</div>}
      </div>

      {sorted.map((r, i) => {
        const meta = isZimmet ? rowMeta[deviceKeyOf(r)] || {} : {};
        const status = meta.status || "Yeni";
        const statusColor = STATUS_COLORS[status];
        const selected = selectedKeys.has(rowKeyOf(r));
        const focused = rowKeyOf(r) === detailRowKey;
        return (
          <div
            key={i}
            onClick={() => setDetailRowKey(rowKeyOf(r))}
            style={{
              ...styles.denseRow,
              gridTemplateColumns: cols,
              cursor: "pointer",
              background: selected || focused ? pal.accentSoftStrong : i % 2 ? pal.fieldBg : "transparent",
            }}
          >
            <div style={{ ...styles.denseStripe, background: stripeColor(r) }} />
            <div style={styles.denseTd} onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={selected} onChange={() => toggleSelect(rowKeyOf(r))} style={styles.checkbox} />
            </div>
            <div style={styles.denseTd}>
              <span
                style={{ fontWeight: 600, ...(isZimmet && r.owner !== "—" ? styles.clickableName : {}) }}
                onClick={isZimmet && r.owner !== "—" ? (e) => { e.stopPropagation(); setSelectedPerson(r.owner); } : undefined}
                title={r.ownerFull || undefined}
              >
                {r.owner}
              </span>
              {!isZimmet && <span style={{ color: pal.inkSoft }}> · {r.sub}</span>}
            </div>
            <div style={{ ...styles.denseTd, ...styles.denseSerial, ...styles.clickableName }} title="Detayını sağda göster">
              {r.serial}
            </div>
            <div style={styles.denseTd}>{isZimmet ? r.sub : r.model}</div>
            <div style={styles.denseTd}>
              {isZimmet ? (
                <span
                  style={r.userLabel !== "—" && r.userLabel !== "Tespit Edilemedi" ? styles.clickableName : undefined}
                  onClick={r.userLabel !== "—" && r.userLabel !== "Tespit Edilemedi" ? (e) => { e.stopPropagation(); setSelectedPerson(r.userLabel); } : undefined}
                >
                  {r.userLabel}
                </span>
              ) : (
                r.location
              )}
            </div>
            <div style={styles.denseTd}>
              <span style={{ fontSize: 13, fontWeight: 700, color: stripeColor(r) }}>{isZimmet || r.diskLevel ? r.statusTag : r.matched ? "Eşleşti" : "Eşleşmedi"}</span>
            </div>
            {isZimmet && (
              <div style={{ ...styles.denseTd, gap: 6 }} onClick={(e) => e.stopPropagation()}>
                {!r.matched && (
                  <div style={styles.opsCell}>
                    <span
                      onClick={() => cycleStatus(deviceKeyOf(r))}
                      title="Durumu değiştirmek için tıklayın"
                      style={{ ...styles.statusPill, background: statusColor.bg, color: statusColor.fg }}
                    >
                      {status}
                    </span>
                    <input
                      type="text"
                      placeholder="Not..."
                      value={meta.note || ""}
                      onChange={(e) => setNote(deviceKeyOf(r), e.target.value)}
                      style={{ ...styles.noteInput, width: 70 }}
                    />
                    <span
                      onClick={() => toggleSnooze(deviceKeyOf(r))}
                      title={meta.snoozed ? "Ertelemeyi kaldır" : "Ertele"}
                      style={{ ...styles.iconBtnSmall, ...(meta.snoozed ? styles.iconBtnSmallActive : {}), width: 22, height: 22 }}
                    >
                      ⏸
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {sorted.length === 0 && <div style={{ ...styles.detailEmpty, padding: "24px 0" }}>Sonuç bulunamadı</div>}
    </div>
  );
}
