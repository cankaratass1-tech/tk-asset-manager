// SCCM raporunda BitLocker kontrolü. Ayrı bir kaynak/menü yok: SCCM envanterinin ham satırlarındaki BitLocker sütun(lar)ı okunur.
// Kural: BitLocker bölümünde (başlığında "bitlocker" geçen sütunlar) en az bir "0" değeri bulunan cihaz SORUNLU, hiç "0" değeri bulunmayan SORUNSUZdur.
// Bir hücrede birden çok değer olabilir (sürücü başına, örn. "1;1;0" ya da "1, 0"): hücre boşluk, virgül, noktalı virgül, "|" ve "/" ile ayrılarak
// her değer ayrı değerlendirilir. "0" ile aynı anlama gelen sözcükler de (No, Hayır, False, Off, Disabled, Kapalı) 0 sayılır; böylece
// "Yes/No" biçimindeki dosyalarda da çalışır. Boş hücre sorun sayılmaz (değer yok). Gerekirse yalnızca aşağıdaki ZERO desenini değiştirmek yeter.
const ZERO = /^(0+(\.0+)?|no|hay[ıi]r|false|off|disabled|kapal[ıi])$/i;
const POSITIVE = /^(1+(\.0+)?|yes|true|evet|on|enabled|a[cç][ıi]k)$/i;

const lower = (v) => String(v ?? "").toLocaleLowerCase("tr-TR");

// Başlığında "bitlocker" geçen sütunlar (BitLocker bölümü)
export const bitlockerColumns = (columns = []) => columns.filter((c) => lower(c).includes("bitlocker"));

export const bitlockerTokens = (value) =>
  String(value ?? "").split(/[\s,;|/\\]+/).map((t) => t.trim()).filter(Boolean);

// Bu hücrede en az bir 0 değeri var mı?
export const cellHasZero = (value) => bitlockerTokens(value).some((t) => ZERO.test(t));

// DEĞER SIRASI = DİSK: hücredeki 1. değer (x1) C diskini, 2. değer (x2) Q diskini, varsa 3. değer (x3) harici USB'yi belirtir; 0 = o disk şifreli değil.
// 3'ten fazla değer olursa "Ek disk 1, 2…" diye adlandırılır. Tek değerli hücre (örn. "No") x1 gibi yani C diski sayılır.
export const DISK_LABELS = ["C diski", "Q diski", "Harici USB"];
export const diskLabelOf = (index) => DISK_LABELS[index] || `Ek disk ${index - DISK_LABELS.length + 1}`;

// Bir hücredeki şifrelenmemiş (0 değerli) disklerin adları, değer sırasına göre
export const unencryptedDiskLabels = (value) => bitlockerTokens(value).map((t, i) => (ZERO.test(t) ? diskLabelOf(i) : null)).filter(Boolean);

export const ALL_ENCRYPTED = "Tümü şifreli";
// Satır için özet metin: şifrelenmemiş diskler ("C diski, Q diski"); hiç 0 yoksa "Tümü şifreli"; BitLocker verisi yoksa "".
// Birden çok BitLocker sütunu varsa disk adının yanına sütun adı eklenir.
export function bitlockerDiskSummary(row, cols) {
  if (!row || !cols.length) return "";
  const hasData = cols.some((c) => bitlockerTokens(row[c]).length > 0);
  if (!hasData) return "";
  const out = [];
  cols.forEach((c) => unencryptedDiskLabels(row[c]).forEach((l) => out.push(cols.length > 1 ? `${l} (${c})` : l)));
  return out.length ? out.join(", ") : ALL_ENCRYPTED;
}

// Satırın (ham Excel satırı) BitLocker bölümünde en az bir 0 değeri var mı? (sorunlu cihaz)
export const hasBitlockerZero = (row, cols) => !!row && cols.some((c) => cellHasZero(row[c]));

// Cihaz kartı için: bütün değerler olumluysa true (örn. "Yes", "1", "1;1")
export const bitlockerAllOn = (value) => {
  const t = bitlockerTokens(value);
  return t.length > 0 && t.every((x) => POSITIVE.test(x));
};
