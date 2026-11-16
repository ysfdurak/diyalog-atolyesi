// Diyalog Atölyesi sunucusu — başlatma.  Kullanım: npm start   (ayarlar: .env.example, docs/SUNUCU_KURULUMU.md)
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { loadConfig } from './config.js';
import { openStore } from './store.js';
import { createApp, istanbulGunu } from './app.js';
import { anthropicModel, sahteModel } from '../src/cekirdek/model.js';
import { createBildirim } from './bildirim.js';

const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);
const config = loadConfig();
if (config.errors.length) {
  console.error('Diyalog Atölyesi başlatılamadı, ayarları kontrol et:\n - ' + config.errors.join('\n - '));
  process.exit(1);
}

mkdirSync(config.dataDir, { recursive: true });
const store = openStore(config.dbFile);
const model = config.modelMode === 'mock'
  ? sahteModel()
  : anthropicModel({
    apiKey: config.apiKey, karakterModeli: config.karakterModeli, degerlendiriciModeli: config.degerlendiriciModeli,
    kullanim: (k) => store.kullanimKaydet(istanbulGunu(), k),
  });
if (config.modelMode === 'mock') log('UYARI: MODEL_MODE=mock — yapay zekâ KAPALI, karakter basit kurallarla cevap veriyor. Yalnızca deneme için.');

let app;
try {
  const bildirim = createBildirim({ url: config.bildirimUrl, store, gun: () => istanbulGunu(), log });
  app = createApp({ config, store, model, bildirim, log });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
setInterval(() => app.bakim(), 3600e3).unref();

const server = createServer(app.handle);
server.listen(config.port, config.host, () => {
  log(`Diyalog Atölyesi: ${config.appUrl} (dinlenen ${config.host}:${config.port}) · model: ${config.modelMode === 'mock' ? 'sahte' : `${config.karakterModeli} / ${config.degerlendiriciModeli}`} · limit: ziyaretçi ${config.ziyaretciGunluk}/gün, site ${config.siteGunluk}/gün · MCP: ${config.mcpEnabled ? 'açık' : 'kapalı'} · bildirim: ${config.bildirimUrl ? 'açık' : 'yalnızca kayıt'} · kredi takibi: ${config.krediUsd ? config.krediUsd + ' $' : 'kapalı'}`);
});

function shutdown(signal) {
  log(`${signal} alındı, kapanıyor…`);
  server.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
