// Sol menü simgeleri (çizgi stili, 24x24; renk aktif durumda vurgu, değilse soluk metin rengi).
const PATHS = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></>,
  power: <><path d="M12 3v9" /><path d="M6.3 6.3a8 8 0 1 0 11.4 0" /></>,
  disk: <><path d="M22 12H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /><path d="M6 16h.01M10 16h.01" /></>,
  swap: <><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></>,
  pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  monitor: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  clipboard: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></>,
  plus: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 8v8M8 12h8" /></>,
  shield: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  battery: <><rect x="2" y="7" width="16" height="10" rx="2" /><path d="M22 11v2M6 11v2M10 11v2" /></>,
  cpu: <><rect x="5" y="5" width="14" height="14" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  gauge: <><path d="m12 14 4-4" /><path d="M3.3 17a10 10 0 1 1 17.4 0" /></>,
  wifi: <><path d="M5 12.5a10 10 0 0 1 14 0" /><path d="M8.5 16a5 5 0 0 1 7 0" /><path d="M2 9a15 15 0 0 1 20 0" /><path d="M12 20h.01" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>,
  dot: <circle cx="12" cy="12" r="3" />,
};

// rapor / menü kimliği → simge
export const MENU_ICONS = {
  inaktif: "power", disk: "disk", zimmet: "swap", "lokasyon-ip": "pin", kullanilmayan: "clock", "atil-monitor": "monitor",
  "kapatma-onayi": "clipboard", "yeni-kurulum": "plus", "sccm-ajan": "shield", "battery-health": "battery", "ajan-yuklu": "cpu",
  bsod: "alert", darbogaz: "gauge", "bant-genisligi": "wifi",
};

export default function NavIcon({ name, active, pal }) {
  return (
    <svg
      data-nav-icon={name}
      width="17" height="17" viewBox="0 0 24 24" fill="none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ flexShrink: 0, stroke: active ? pal.accent : pal.inkSoft }}
    >
      {PATHS[name] || PATHS.dot}
    </svg>
  );
}
