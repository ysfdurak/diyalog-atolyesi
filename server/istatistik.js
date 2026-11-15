// Kullanım özeti (son 30 gün).  Sunucuda: sudo docker exec diyalog node server/istatistik.js
// Tahmini maliyet, .env'deki modellerin liste fiyatıyla hesaplanır; fiyat değişirse FIYAT tablosunu güncelle.
import { loadConfig } from './config.js';
import { openStore } from './store.js';
import { istanbulGunu } from './app.js';

// Milyon token başına ABD doları [girdi, çıktı] (platform.claude.com/docs/en/about-claude/pricing, Kasım 2026)
const FIYAT = { 'claude-haiku-5-5': [0.1, 0.5], 'claude-sonnet-5-5': [2, 10], 'claude-opus-5-5': [4, 20] };

const config = loadConfig({ ...process.env, MODEL_MODE: 'mock' });
const store = openStore(config.dbFile);
const ozet = store.istatistik(istanbulGunu(Date.now() - 30 * 86400e3));
let maliyet = 0;
for (const k of ozet.kullanim) {
  const f = FIYAT[k.model];
  k.tahmini_usd = f ? Number(((k.girdi * f[0] + k.cikti * f[1]) / 1e6).toFixed(4)) : null;
  maliyet += k.tahmini_usd || 0;
}
console.log(JSON.stringify({ donem: 'son 30 gün', ...ozet, tahmini_toplam_usd: Number(maliyet.toFixed(4)) }, null, 2));
store.close();
