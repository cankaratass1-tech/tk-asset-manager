// Genel amaçlı sayfalama kontrolü — tüm rapor ekranlarında standart (kullanıcı isteği: "Bütün
// raporlarda sayfala sayıları olsun, her sayfada min 25 default olarak görünsün, sayfa
// değiştirilebilsin aşağıdan"). App.jsx'teki tek ortak tableFooter/pagedRows pipeline'ı zaten
// tüm raporlar için aynı olduğundan, bu bileşen buraya bir kez bağlanınca her rapor ekranında
// otomatik çalışır.
function pageWindow(current, total) {
  // İlk, son, mevcut sayfa ±2 komşusu — aradakiler "…" ile kısaltılır (binlerce sayfa
  // olabildiği için, ör. Zimmet Uyuşmazlığı 21.000+ kayıt/25 ≈ 840+ sayfa)
  const pages = new Set([1, total, current, current - 1, current + 1, current - 2, current + 2]);
  return Array.from(pages)
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
}

export default function Pagination({ page, totalPages, onChange, styles, pal }) {
  if (totalPages <= 1) return null;
  const windowed = pageWindow(page, totalPages);

  const btn = (label, target, disabled, active) => (
    <span
      key={`${label}-${target}`}
      onClick={disabled ? undefined : () => onChange(target)}
      style={{
        ...styles.iconBtnSmall,
        ...(active ? styles.iconBtnSmallActive : {}),
        width: "auto",
        minWidth: 28,
        padding: "0 8px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {label}
    </span>
  );

  const items = [];
  // En başa / en sona git (kullanıcı isteği)
  items.push(btn("«", 1, page === 1, false));
  items.push(btn("‹", Math.max(1, page - 1), page === 1, false));
  windowed.forEach((p, i) => {
    if (i > 0 && p - windowed[i - 1] > 1) {
      items.push(
        <span key={`ellipsis-${p}`} style={{ color: pal.inkSoft, padding: "0 2px" }}>
          …
        </span>
      );
    }
    items.push(btn(String(p), p, false, p === page));
  });
  items.push(btn("›", Math.min(totalPages, page + 1), page === totalPages, false));
  items.push(btn("»", totalPages, page === totalPages, false));

  return <div style={{ display: "flex", alignItems: "center", gap: 4 }}>{items}</div>;
}
