// SharePoint/OneDrive senkron klasöründeki "DiskAlani_yyyyMMddHHmmss.xlsx" dosyasını backend
// üzerinden okuyup rapor satırı biçimine çevirir. Gerçek dosya SCCM'in "Computers with low free
// disk space" raporu — sadece cihaz adı ve disk kullanımı var, sahip/lokasyon/şirket bilgisi YOK
// (İnaktif Cihazlar'daki gibi bir "Sahibi Firma" sütunu bulunmuyor). Bu yüzden Disk Alanı raporu
// şirkete göre gruplanmadan, düz bir liste olarak gösteriliyor.
import { backendClient } from "./backendClient";
import { mapDiskRow } from "./diskRowFileService";

export { mapDiskRow };

export async function fetchDiskRowsFromFile() {
  const result = await backendClient.getDiskAlaniReport();
  if (!result.ok) throw new Error(result.message || "Dosya okunamadı");
  return {
    fileName: result.fileName,
    modifiedAt: result.modifiedAt,
    rows: (result.rows || []).map(mapDiskRow),
  };
}
