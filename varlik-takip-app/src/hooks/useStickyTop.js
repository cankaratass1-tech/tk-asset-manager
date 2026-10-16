import { useEffect, useRef, useState } from "react";

// position: sticky olan bir kutu ekrandan UZUNSA (ör. çok maddeli sol menü, uzun detay paneli) sabit "top" değeri alt kısmını
// erişilemez bırakır ve sayfa kaydırılırken kutu yerinde "donuyor" (kutu bitince kayma başlıyor). Çözüm: kutu uzunsa top'u
// NEGATİF ver — kutu sayfayla birlikte kayar, ALT ucu ekranın altına gelince sabitlenir; hepsine erişilir.
// Kısa kutuda top = margin (klasik sabit davranış). Boyut değişince (ResizeObserver) ve pencere yeniden boyutlanınca güncellenir.
export function useStickyTop(margin = 16) {
  const ref = useRef(null);
  const [top, setTop] = useState(margin);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setTop(Math.min(margin, Math.round(window.innerHeight - el.offsetHeight - margin)));
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener("resize", update);
    return () => { ro?.disconnect(); window.removeEventListener("resize", update); };
  });
  return [ref, top];
}
