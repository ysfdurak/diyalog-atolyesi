// Kullanım özeti (son 30 gün).  Sunucuda: sudo docker exec diyalog node server/istatistik.js
// Tahmini maliyet, .env'deki modellerin liste fiyatıyla hesaplanır; fiyat değişirse FIYAT tablosunu güncelle.
import { loadConfig } from './config.js';
import { openStore } from './store.js';
import { istanbulGunu } from './app.js';
import { satirUsd, tahminiUsd } from '../src/cekirdek/fiyat.js';

const config = loadConfig({ ...process.env, MODEL_MODE: 'mock' });
const store = openStore(config.dbFile);
const ozet = store.istatistik(istanbulGunu(Date.now() - 30 * 86400e3));
for (const k of ozet.kullanim) {
  const usd = satirUsd(k);
  k.tahmini_usd = usd == null ? null : Number(usd.toFixed(4));
}
const kredi = config.krediUsd
  ? { yuklenen_usd: config.krediUsd, baslangic: config.krediBaslangic, tahmini_kalan_usd: Number((config.krediUsd - tahminiUsd(store.kullanimSatirlari(config.krediBaslangic))).toFixed(2)) }
  : 'KREDI_USD tanımlı değil';
console.log(JSON.stringify({ donem: 'son 30 gün', ...ozet, tahmini_toplam_usd: Number(tahminiUsd(ozet.kullanim).toFixed(4)), kredi, canli_oturumlar: store.metaOku('kapali') ? 'KAPALI: ' + store.metaOku('kapali') : 'açık' }, null, 2));
store.close();
