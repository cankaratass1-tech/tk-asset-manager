// Model bilgisi bazen virgülle ayrılmış ASCII kod dizisi olarak gelir: "76, 69, 78" → "LEN"
export function decodeModelIfNeeded(raw) {
  if (!raw) return raw;
  const parts = raw.split(",").map((p) => p.trim());
  const looksLikeAsciiList =
    parts.length > 3 &&
    parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 32 && Number(p) <= 126);
  if (!looksLikeAsciiList) return raw;
  return parts.map((p) => String.fromCharCode(Number(p))).join("").trim();
}
