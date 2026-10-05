import { useEffect, useRef } from "react";
import { Chart, BarController, LineController, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend } from "chart.js";

Chart.register(BarController, LineController, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

// Ana Sayfa "Genel Trend" paneli — İnaktif Cihaz + Zimmet Uyuşmazlığı sayılarını lokasyon
// ekseninde çubuk, uyuşmazlık oranını (%) çizgi olarak gösterir (bkz. konuşma: Sage Intelligence
// referansına göre uyarlanmış örnek). Uygulamada zaman serisi veri yok (Excel dosyaları hep en
// son hal), bu yüzden "trend" burada lokasyon kırılımı anlamına geliyor — bu netleştirildi.
export default function LocationTrendChart({ data, pal, height = 260 }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();

    const labels = data.map((d) => d.location);
    chartRef.current = new Chart(canvasRef.current, {
      data: {
        labels,
        datasets: [
          { type: "bar", label: "İnaktif Cihaz", data: data.map((d) => d.inaktif), backgroundColor: pal.warnFg, borderRadius: 4, yAxisID: "y" },
          { type: "bar", label: "Zimmet Uyuşmazlığı", data: data.map((d) => d.zimmet), backgroundColor: pal.bad, borderRadius: 4, yAxisID: "y" },
          { type: "line", label: "Uyuşmazlık Oranı", data: data.map((d) => d.oranPct), borderColor: pal.ok, backgroundColor: pal.ok, tension: 0.35, pointRadius: 3, yAxisID: "y1" },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "top", labels: { color: pal.ink, boxWidth: 10, font: { size: 11 } } },
        },
        scales: {
          x: { ticks: { color: pal.inkSoft, font: { size: 10 }, maxRotation: 30, minRotation: 30 }, grid: { display: false } },
          y: { position: "left", beginAtZero: true, ticks: { color: pal.inkSoft, font: { size: 10 } }, grid: { color: pal.line } },
          y1: { position: "right", beginAtZero: true, max: 100, ticks: { color: pal.inkSoft, font: { size: 10 }, callback: (v) => `${v}%` }, grid: { display: false } },
        },
      },
    });

    return () => {
      if (chartRef.current) chartRef.current.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data), pal]);

  if (data.length === 0) {
    return <p style={{ color: pal.inkSoft, fontSize: 13.5, margin: 0 }}>Veri bekleniyor — İnaktif Cihazlar ve Zimmet Uyuşmazlığı dosyaları henüz yüklenmedi</p>;
  }

  return (
    <div style={{ height }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
