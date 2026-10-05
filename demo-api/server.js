// Demo envanter API'si — Veri Kaynağı (API) bağlantı testi için, veri tamamen sahte
const http = require("http");

const PORT = 4000;
const API_KEY = "demo-key-12345";

const INVENTORY = [
  { Hostname: "IST-WKS-0142", SerialNumber: "SN-88213X", Model: "Dell Latitude 5420", Manufacturer: "Dell Inc.", IPAddresses: "10.12.4.51", MACAddresses: "AC:1F:6B:22:9C:01", LastLogon: "2026-08-10T09:14:00Z" },
  { Hostname: "ABJ-WKS-0087", SerialNumber: "SN-77410A", Model: "HP EliteBook 840", Manufacturer: "HP Inc.", IPAddresses: "10.44.2.19", MACAddresses: "3C:A8:2A:11:4D:7E", LastLogon: "2026-08-11T07:02:00Z" },
  { Hostname: "GMD-WKS-0033", SerialNumber: "SN-91027M", Model: "Lenovo ThinkPad T14", Manufacturer: "Lenovo", IPAddresses: "10.5.0.201", MACAddresses: "00:1A:2B:3C:4D:5E", LastLogon: "2026-06-02T18:47:00Z" },
  { Hostname: "TOR-WKS-0021", SerialNumber: "SN-65590T", Model: "Dell Latitude 5420", Manufacturer: "Dell Inc.", IPAddresses: "10.77.1.44", MACAddresses: "AC:1F:6B:22:9C:9A", LastLogon: "2026-08-12T14:30:00Z" },
  { Hostname: "IZM-WKS-0058", SerialNumber: "SN-40218C", Model: "Lenovo ThinkPad T14", Manufacturer: "Lenovo", IPAddresses: "10.19.3.12", MACAddresses: "00:1A:2B:3C:4D:9F", LastLogon: "2026-08-13T08:55:00Z" },
];

const ALLOWED_ORIGINS = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (!origin) {
    res.setHeader("Access-Control-Allow-Origin", "null");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

const server = http.createServer((req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/inventory" && req.method === "GET") {
    const key = req.headers["x-api-key"];
    if (key !== API_KEY) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Geçersiz veya eksik API anahtarı (x-api-key)" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(INVENTORY));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Bulunamadı" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Demo envanter API'si http://localhost:${PORT}/api/inventory adresinde çalışıyor (x-api-key: ${API_KEY})`);
});
