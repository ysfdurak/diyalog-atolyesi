// HTTP katmanı: web kapısı (/api), MCP kapısı (/mcp) ve arayüz dosyaları.
// Kural içermez; kimliği (ziyaretçi özeti) belirler, isteği çekirdeğe iletir, hatayı HTTP'ye çevirir.
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { gununSenaryosu, senaryolariYukle } from '../src/cekirdek/senaryolar.js';
import { KuralHatasi, oturumServisi, SORU_UZUNLUGU, TAHMIN_UZUNLUGU } from '../src/cekirdek/oturum.js';
import { ModelHatasi } from '../src/cekirdek/model.js';
import { createMcpHandler } from './mcp.js';
import { tahminiUsd } from '../src/cekirdek/fiyat.js';

const TURLER = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const GOVDE_SINIRI = 8 * 1024;

/** Türkiye saatine göre gün (YYYY-AA-GG): limitler gece yarısı İstanbul saatiyle sıfırlanır. */
export const istanbulGunu = (zaman = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(zaman));

/**
 * @param {object} o
 * @param {ReturnType<import('./config.js').loadConfig>} o.config
 * @param {ReturnType<import('./store.js').openStore>} o.store
 * @param {object} o.model
 */
// Model kredi ya da yetki hatası verince canlı oturumlar kapanır; bu süre dolunca bir sonraki ziyaretçiyle yeniden denenir.
const YENIDEN_DENEME_MS = 30 * 60_000;
const KAPALI_MESAJI = {
  kredi: 'Canlı oturumlar geçici olarak kapalı: yapay zekâ kullanım kredisi tükendi. Site sahibine haber verildi. Bu arada örnek oturumu inceleyebilirsin.',
  yetki: 'Canlı oturumlar geçici olarak kapalı: yapay zekâ servisine bağlanılamıyor. Site sahibine haber verildi. Bu arada örnek oturumu inceleyebilirsin.',
};

export function createApp({ config, store, model: hamModel, bildirim = { gonder: () => false }, log = () => {}, simdi = Date.now }) {
  const senaryolar = senaryolariYukle(config.senaryoDir);
  const tuz = store.tuz();
  const ozet = (v) => createHash('sha256').update(String(v)).digest();
  const mcpAnahtarlari = config.mcpAnahtarlari.map(ozet);

  // Arayüz dosyaları açılışta belleğe alınır; yalnızca web/ klasöründeki dosyalar sunulur.
  const dosyalar = new Map();
  for (const ad of readdirSync(config.webDir)) {
    if (TURLER[extname(ad)]) dosyalar.set('/' + ad, { tur: TURLER[extname(ad)], icerik: readFileSync(join(config.webDir, ad)) });
  }

  // --- Servis durumu: kredi bitti / anahtar reddedildi --------------------------------
  // Durum veritabanında da tutulur; sunucu yeniden başlasa bile her ziyaretçi boşuna hata almaz.
  let kapali = null;
  try {
    kapali = JSON.parse(store.metaOku('kapali') || 'null');
  } catch { /* bozuk kayıt: açık say */ }
  const kapaliNedeni = () => (kapali && simdi() - kapali.zaman < YENIDEN_DENEME_MS ? kapali.neden : null);

  function kapat(neden, ayrinti) {
    kapali = { neden, zaman: simdi() };
    store.metaYaz('kapali', JSON.stringify(kapali));
    log(`Canlı oturumlar kapandı (${neden}): ${ayrinti}`);
    bildirim.gonder(neden === 'kredi' ? 'kredi-bitti' : 'anahtar-reddedildi',
      neden === 'kredi'
        ? 'Anthropic kredisi bitti. Canlı oturumlar kapalı, ziyaretçiler örnek oturuma yönlendiriliyor. console.anthropic.com → Billing üzerinden yükleme yapınca en geç 30 dakika içinde kendiliğinden açılır.'
        : 'Anthropic API anahtarı reddedildi. Canlı oturumlar kapalı. Sunucuda ~/diyalog-atolyesi/.env içindeki ANTHROPIC_API_KEY değerini kontrol et.',
      { acil: true });
  }

  /** Model çağrılarını izler: kredi/yetki hatasında servisi kapatır, ilk başarılı çağrıda yeniden açar. */
  const izle = (ad) => async (girdi) => {
    try {
      const yanit = await hamModel[ad](girdi);
      if (kapali) {
        kapali = null;
        store.metaYaz('kapali', null);
        log('Canlı oturumlar yeniden açıldı.');
      }
      return yanit;
    } catch (err) {
      if (err instanceof ModelHatasi && KAPALI_MESAJI[err.kod]) {
        kapat(err.kod, err.message);
        throw new ModelHatasi(KAPALI_MESAJI[err.kod], { kod: err.kod });
      }
      throw err;
    }
  };
  const model = { ad: hamModel.ad, karakter: izle('karakter'), degerlendir: izle('degerlendir') };

  /** Tahmini kalan kredi eşiğin altına indiyse site sahibine haber verir (KREDI_USD tanımlıysa). */
  function krediKontrol() {
    if (!config.krediUsd) return;
    const harcanan = tahminiUsd(store.kullanimSatirlari(config.krediBaslangic));
    const kalan = config.krediUsd - harcanan;
    if (kalan <= (config.krediUsd * config.krediUyariYuzde) / 100) {
      bildirim.gonder('kredi-azaldi', `Tahmini kalan kredi ${Math.max(0, kalan).toFixed(2)} $ (${config.krediUsd} $ içinden ${harcanan.toFixed(2)} $ harcandı). Bitmeden yükleme yapmak için: console.anthropic.com → Billing. Yükledikten sonra .env içinde KREDI_USD ve KREDI_BASLANGIC değerlerini güncelle.`);
    }
  }

  /** Kullanım limiti: oturum başlatılırken çağrılır. Web'de ziyaretçi ve site sayaçları, MCP'de ayrı bir sayaç düşer. */
  function limit(kanal, ziyaretci) {
    const neden = kapaliNedeni();
    if (neden) return { izin: false, mesaj: KAPALI_MESAJI[neden] }; // hak düşmeden reddedilir
    const gun = istanbulGunu(simdi());
    if (kanal === 'mcp') {
      return store.hakDus(gun, [{ anahtar: 'mcp', sinir: config.mcpGunluk, mesaj: 'Bugünkü MCP oturum hakkı doldu. Yarın tekrar dene.' }]);
    }
    const sonuc = store.hakDus(gun, [
      { anahtar: 'z:' + ziyaretci, sinir: config.ziyaretciGunluk, mesaj: `Bugünkü ${config.ziyaretciGunluk} oturum hakkını kullandın. Yarın yeni senaryolarla devam edebilirsin.` },
      { anahtar: 'site', sinir: config.siteGunluk, mesaj: 'Bugün için site genelindeki oturum hakkı doldu. Yarın tekrar dene; bu arada örnek oturumu inceleyebilirsin.' },
    ]);
    if (sonuc.anahtar === 'site') bildirim.gonder('site-tavani', `Bugünkü site tavanı (${config.siteGunluk} oturum) doldu; yeni ziyaretçiler yarına kadar oturum açamıyor. Sık oluyorsa .env içinde SITE_GUNLUK_OTURUM değerini yükselt.`);
    return sonuc;
  }

  const servis = oturumServisi({
    senaryolar, model, limit, simdi, log,
    kaydet: (o) => {
      store.oturumKaydet(istanbulGunu(simdi()), o);
      krediKontrol();
    },
  });
  const mcp = config.mcpEnabled ? createMcpHandler({ servis, log }) : null;

  /** Ziyaretçi kimliği: IP adresinin tuzlu özeti. IP'nin kendisi saklanmaz. Caddy/Cloudflare arkasında gerçek IP başlıktan okunur. */
  function ziyaretci(req) {
    const ip = String(req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '');
    return ozet(tuz + ip).toString('base64url').slice(0, 22);
  }

  // Basit hız sınırı: ziyaretçi başına dakikada 40 API isteği (bellekte; limit sayaçlarından bağımsız).
  const istekler = new Map();
  function hizSiniri(kim) {
    const an = simdi();
    const k = istekler.get(kim);
    if (!k || an - k.baslangic > 60_000) {
      istekler.set(kim, { baslangic: an, sayi: 1 });
      return true;
    }
    return ++k.sayi <= 40;
  }

  function basliklar(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  }

  function json(res, durum, veri) {
    res.statusCode = durum;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(veri));
  }

  function readJson(req) {
    return new Promise((resolve, reject) => {
      let boyut = 0;
      const parcalar = [];
      req.on('data', (p) => {
        boyut += p.length;
        if (boyut > GOVDE_SINIRI) {
          reject(new KuralHatasi('İstek çok büyük.', { durum: 413 }));
          req.destroy();
        } else parcalar.push(p);
      });
      req.on('end', () => {
        try {
          const metin = Buffer.concat(parcalar).toString('utf8');
          const veri = metin ? JSON.parse(metin) : {};
          if (!veri || typeof veri !== 'object') throw new Error('nesne değil');
          resolve(veri);
        } catch {
          reject(new KuralHatasi('İstek gövdesi geçerli JSON olmalı.'));
        }
      });
      req.on('error', reject);
    });
  }

  function durum(kim) {
    const gun = istanbulGunu(simdi());
    return {
      senaryolar: servis.senaryoListesi(),
      gununSenaryosu: gununSenaryosu(senaryolar, gun).id,
      gunlukHak: config.ziyaretciGunluk,
      kalanOturum: Math.max(0, config.ziyaretciGunluk - store.sayi(gun, 'z:' + kim)),
      siteAcik: store.sayi(gun, 'site') < config.siteGunluk,
      kapaliMesaji: kapaliNedeni() ? KAPALI_MESAJI[kapaliNedeni()] : null,
      yapayZeka: model.ad !== 'sahte',
      sinirlar: { soru: SORU_UZUNLUGU, tahmin: TAHMIN_UZUNLUGU },
    };
  }

  async function api(req, res, path) {
    const kim = ziyaretci(req);
    if (!hizSiniri(kim)) return json(res, 429, { hata: 'Çok hızlı istek gönderiyorsun. Bir dakika sonra tekrar dene.' });
    if (path === '/api/durum' && req.method === 'GET') return json(res, 200, durum(kim));
    if (req.method !== 'POST') return json(res, 405, { hata: 'Yöntem desteklenmiyor.' });
    // Yazma istekleri yalnızca uygulamanın kendi sayfasından kabul edilir (başka sitelerin ziyaretçi adına oturum açmasını önler).
    const origin = req.headers.origin;
    if (origin && origin !== new URL(config.appUrl).origin) return json(res, 403, { hata: 'İstek kaynağı reddedildi.' });
    const govde = await readJson(req);
    if (path === '/api/oturum') return json(res, 200, servis.baslat({ senaryoId: govde.senaryoId, kanal: 'web', ziyaretci: kim }));
    if (path === '/api/oturum/soru') return json(res, 200, await servis.soruSor({ oturumId: govde.oturumId, soru: govde.soru }));
    if (path === '/api/oturum/degerlendir') return json(res, 200, await servis.degerlendir({ oturumId: govde.oturumId, tahmin: govde.tahmin }));
    return json(res, 404, { hata: 'Bulunamadı.' });
  }

  /** /mcp kimliği: "Authorization: Bearer <anahtar>" ya da adresin sonunda /mcp/<anahtar>. */
  function mcpYetkili(req, path) {
    const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
    const sunulan = m?.[1] || path.slice('/mcp/'.length);
    if (!sunulan) return false;
    const h = ozet(sunulan);
    return mcpAnahtarlari.some((a) => timingSafeEqual(a, h));
  }

  async function handle(req, res) {
    basliklar(res);
    let path;
    try {
      path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      return json(res, 400, { hata: 'Geçersiz adres.' });
    }
    try {
      if (path === '/healthz') return json(res, 200, { ok: true });

      if (path === '/mcp' || path.startsWith('/mcp/')) {
        if (!mcp) return json(res, 404, { hata: 'MCP kapısı bu kurulumda kapalı.' });
        if (!mcpYetkili(req, path)) return json(res, 401, { hata: 'Geçerli bir MCP erişim anahtarı gerekli.' });
        // Durumsuz (stateless) çalışır: yalnızca POST.
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST');
          return json(res, 405, { hata: 'Yöntem desteklenmiyor.' });
        }
        return await mcp.handle(req, res, await readJson(req));
      }

      if (path.startsWith('/api/')) return await api(req, res, path);

      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { hata: 'Yöntem desteklenmiyor.' });
      const dosya = dosyalar.get(path === '/' ? '/index.html' : path);
      if (!dosya) return json(res, 404, { hata: 'Bulunamadı.' });
      res.statusCode = 200;
      res.setHeader('Content-Type', dosya.tur);
      res.setHeader('Cache-Control', dosya.tur.startsWith('text/html') ? 'no-cache' : 'public, max-age=300');
      return res.end(req.method === 'HEAD' ? undefined : dosya.icerik);
    } catch (err) {
      if (res.headersSent) return res.end();
      if (err instanceof KuralHatasi) return json(res, err.durum, { hata: err.message, kod: err.kod });
      if (err instanceof ModelHatasi && KAPALI_MESAJI[err.kod]) return json(res, 503, { hata: err.message, kod: 'kapali' });
      if (err instanceof ModelHatasi) {
        log(`Model hatası: ${err.message}`);
        return json(res, 502, { hata: 'Yapay zekâ servisi şu an cevap vermiyor. Birkaç saniye sonra tekrar dene; soru hakkın düşmedi.', kod: 'model' });
      }
      log(`Beklenmeyen hata: ${err?.stack || err}`);
      return json(res, 500, { hata: 'İstek işlenemedi.' });
    }
  }

  /** Saatlik bakım: süresi dolan oturumlar, eski ziyaretçi sayaçları, hız sınırı kayıtları. */
  function bakim() {
    servis.supur();
    store.temizle(istanbulGunu(simdi() - 2 * 86400e3));
    for (const [kim, k] of istekler) if (simdi() - k.baslangic > 60_000) istekler.delete(kim);
  }

  return { handle, bakim, servis, krediKontrol };
}
