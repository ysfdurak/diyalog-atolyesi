// Ayarlar: hepsi ortam değişkeninden okunur (.env.example). Hatalar toplu döner; sunucu eksik ayarla başlamaz.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sayi = (v, varsayilan, alt, ust) => Math.min(ust, Math.max(alt, Number.isFinite(Number(v)) && v !== '' && v != null ? Math.round(Number(v)) : varsayilan));

export function loadConfig(env = process.env) {
  const errors = [];
  const modelMode = env.MODEL_MODE === 'mock' ? 'mock' : 'anthropic';
  const apiKey = String(env.ANTHROPIC_API_KEY || '').trim();
  if (modelMode === 'anthropic' && !apiKey) {
    errors.push('ANTHROPIC_API_KEY boş. Anahtarı .env dosyasına yaz ya da yapay zekâsız deneme için MODEL_MODE=mock kullan.');
  }

  let appUrl = String(env.APP_URL || 'http://localhost:8080/').trim();
  if (!appUrl.endsWith('/')) appUrl += '/';
  try {
    new URL(appUrl);
  } catch {
    errors.push('APP_URL geçerli bir adres olmalı (ör. https://diyalog.ysfdurak.com/).');
  }

  // MCP_ANAHTARLARI="anahtar1,anahtar2" (her biri en az 32 karakter; üretmek için: openssl rand -hex 32)
  const mcpEnabled = env.MCP_ENABLED === 'true';
  const mcpAnahtarlari = String(env.MCP_ANAHTARLARI || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (mcpAnahtarlari.some((a) => a.length < 32 || !/^[A-Za-z0-9_-]+$/.test(a))) {
    errors.push('MCP_ANAHTARLARI: her anahtar en az 32 karakter olmalı ve yalnızca harf, rakam, tire, alt çizgi içermeli.');
  }
  if (mcpEnabled && !mcpAnahtarlari.length) errors.push('MCP_ENABLED=true için MCP_ANAHTARLARI gerekli (anahtarsız MCP kapısı açılmaz).');

  const dataDir = resolve(env.DATA_DIR || join(kok, 'tmp', 'data'));
  return {
    errors,
    appUrl,
    port: sayi(env.PORT, 8080, 1, 65535),
    host: env.HOST || '0.0.0.0',
    dataDir,
    dbFile: join(dataDir, 'diyalog.db'),
    webDir: join(kok, 'web'),
    senaryoDir: join(kok, 'senaryolar'),
    modelMode,
    apiKey,
    // Karakter kısa ve hızlı cevap verir; değerlendirici raporun kalitesini belirler. İkisi ayrı ayrı değiştirilebilir.
    karakterModeli: env.KARAKTER_MODELI || 'claude-haiku-5-5',
    degerlendiriciModeli: env.DEGERLENDIRICI_MODELI || 'claude-haiku-5-5',
    // Kullanım limitleri: maliyetin üst sınırını bunlar belirler (docs/NASIL_CALISIR.md → Maliyet)
    ziyaretciGunluk: sayi(env.ZIYARETCI_GUNLUK_OTURUM, 3, 1, 100),
    siteGunluk: sayi(env.SITE_GUNLUK_OTURUM, 30, 1, 10000),
    mcpEnabled,
    mcpAnahtarlari,
    mcpGunluk: sayi(env.MCP_GUNLUK_OTURUM, 10, 1, 1000),
  };
}
