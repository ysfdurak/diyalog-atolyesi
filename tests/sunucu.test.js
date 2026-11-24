// Sunucu entegrasyon testleri: gerçek HTTP sunucusu + SQLite + sahte model; MCP için resmi MCP istemcisi.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { loadConfig } from '../server/config.js';
import { openStore } from '../server/store.js';
import { createApp, istanbulGunu } from '../server/app.js';
import { MCP_ARAC_ADLARI } from '../server/mcp.js';
import { anthropicModel, ModelHatasi, sahteModel } from '../src/cekirdek/model.js';
import { createBildirim } from '../server/bildirim.js';

const ANAHTAR = 'm'.repeat(40);
const calisan = new Set();
test.after(async () => { for (const kapat of calisan) await kapat(); });

async function baslat(env = {}, { model = sahteModel(), bildirim, simdi, varyantSec = (a) => a[0] } = {}) {
  const config = loadConfig({ MODEL_MODE: 'mock', DATA_DIR: mkdtempSync(join(tmpdir(), 'diyalog-')), ...env });
  assert.deepEqual(config.errors, []);
  const store = openStore(config.dbFile);
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const taban = `http://127.0.0.1:${server.address().port}`;
  config.appUrl = taban + '/';
  const app = createApp({ config, store, model, bildirim, simdi, varyantSec });
  server.on('request', app.handle);
  const kapat = () => new Promise((r) => { server.close(() => { store.close(); r(); }); server.closeAllConnections(); });
  calisan.add(kapat);
  const post = async (yol, govde, basliklar = {}) => {
    const y = await fetch(taban + yol, { method: 'POST', headers: { 'content-type': 'application/json', ...basliklar }, body: JSON.stringify(govde) });
    return { durum: y.status, veri: await y.json() };
  };
  return { taban, store, post, config, app, kapat: async () => { calisan.delete(kapat); await kapat(); } };
}

test('ayarlar: anahtarsız yayın ve anahtarsız MCP reddedilir', () => {
  assert.match(loadConfig({}).errors.join(' '), /ANTHROPIC_API_KEY/);
  assert.match(loadConfig({ MODEL_MODE: 'mock', MCP_ENABLED: 'true' }).errors.join(' '), /MCP_ANAHTARLARI/);
  assert.match(loadConfig({ MODEL_MODE: 'mock', MCP_ANAHTARLARI: 'kisa' }).errors.join(' '), /en az 32/);
  const c = loadConfig({ MODEL_MODE: 'mock', ZIYARETCI_GUNLUK_OTURUM: '5', APP_URL: 'https://ornek.test' });
  assert.deepEqual([c.errors, c.ziyaretciGunluk, c.siteGunluk, c.appUrl], [[], 5, 30, 'https://ornek.test/']);
});

test('web: arayüz, sağlık kontrolü, güvenlik başlıkları ve bilinmeyen yol', async () => {
  const { taban } = await baslat();
  const ana = await fetch(taban + '/');
  assert.equal(ana.status, 200);
  assert.match(ana.headers.get('content-type'), /text\/html/);
  assert.match(ana.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(await ana.text(), /Diyalog Atölyesi/);
  assert.deepEqual(await (await fetch(taban + '/healthz')).json(), { ok: true });
  assert.equal((await fetch(taban + '/../server/config.js')).status, 404);
  assert.equal((await fetch(taban + '/mcp', { method: 'POST' })).status, 404); // MCP varsayılan kapalı
  const ornek = await (await fetch(taban + '/ornek-oturum.json')).json();
  assert.ok(ornek.toplam > 0 && ornek.sorular.length > 0);
});

test('web: durum gizli bilgi sızdırmaz; baştan sona oturum', async () => {
  const { taban, post, store } = await baslat();
  const durumMetni = await (await fetch(taban + '/api/durum')).text();
  assert.ok(!durumMetni.includes('kok_neden') && !durumMetni.includes('gizli_bilgiler') && !durumMetni.includes('adresleme düzeni'));
  const durum = JSON.parse(durumMetni);
  assert.equal(durum.senaryolar.length, 30);
  assert.deepEqual([durum.kalanOturum, durum.gunlukHak, durum.siteAcik, durum.yapayZeka], [3, 3, true, false]);

  const o = await post('/api/oturum', { senaryoId: 'musteri-sozlesme' });
  assert.equal(o.durum, 200);
  const s = await post('/api/oturum/soru', { oturumId: o.veri.oturumId, soru: 'Son dönemde bizimle çalışmak nasıldı, neler yaşadınız?' });
  assert.match(s.veri.cevap, /sevkiyat/);
  const r = await post('/api/oturum/degerlendir', { oturumId: o.veri.oturumId, tahmin: 'Hizmet hataları güveni zedeledi.' });
  assert.equal(r.durum, 200);
  assert.equal(r.veri.boyutlar.length, 5);
  assert.equal(r.veri.kacirilanlar.length, 3);
  assert.equal((await (await fetch(taban + '/api/durum')).json()).kalanOturum, 2);
  const ozet = store.istatistik(istanbulGunu());
  assert.deepEqual(ozet.biten.map((b) => [b.senaryo, b.kanal, b.adet]), [['musteri-sozlesme', 'web', 1]]);
});

test('web: hatalar anlaşılır mesajla ve doğru durum koduyla döner', async () => {
  const { taban, post } = await baslat();
  assert.equal((await post('/api/oturum', { senaryoId: 'yok' })).durum, 404);
  assert.equal((await post('/api/oturum/soru', { oturumId: 'yok', soru: 'x' })).durum, 404);
  assert.equal((await post('/api/oturum', { senaryoId: 'musteri-sozlesme' }, { origin: 'https://baska-site.test' })).durum, 403);
  const bozuk = await fetch(taban + '/api/oturum', { method: 'POST', body: '{bozuk' });
  assert.equal(bozuk.status, 400);
  const buyuk = await fetch(taban + '/api/oturum', { method: 'POST', body: JSON.stringify({ x: 'a'.repeat(9000) }) }).catch(() => ({ status: 413 }));
  assert.equal(buyuk.status, 413);
  assert.equal((await fetch(taban + '/api/oturum')).status, 405);
});

test('limit: ziyaretçi günde 3 oturum açar; site tavanı ayrı ziyaretçileri de durdurur', async () => {
  const { post } = await baslat();
  for (let i = 0; i < 3; i++) assert.equal((await post('/api/oturum', { senaryoId: 'geciken-teslimler' })).durum, 200);
  const dort = await post('/api/oturum', { senaryoId: 'geciken-teslimler' });
  assert.equal(dort.durum, 429);
  assert.match(dort.veri.hata, /3 oturum hakkını kullandın/);
  // Başka ziyaretçi (farklı IP) kendi hakkını kullanır
  assert.equal((await post('/api/oturum', { senaryoId: 'geciken-teslimler' }, { 'x-forwarded-for': '203.0.113.9' })).durum, 200);

  const site = await baslat({ SITE_GUNLUK_OTURUM: '2' });
  assert.equal((await site.post('/api/oturum', { senaryoId: 'geciken-teslimler' }, { 'x-forwarded-for': '198.51.100.1' })).durum, 200);
  assert.equal((await site.post('/api/oturum', { senaryoId: 'geciken-teslimler' }, { 'x-forwarded-for': '198.51.100.2' })).durum, 200);
  const dolu = await site.post('/api/oturum', { senaryoId: 'geciken-teslimler' }, { 'x-forwarded-for': '198.51.100.3' });
  assert.equal(dolu.durum, 429);
  assert.match(dolu.veri.hata, /site genelindeki/);
  assert.equal((await (await fetch(site.taban + '/api/durum')).json()).siteAcik, false);
});

test('depo: IP saklanmaz, konuşma metni yazılmaz', async () => {
  const { post, config, kapat } = await baslat();
  const o = await post('/api/oturum', { senaryoId: 'depo-verim-dususu' }, { 'x-forwarded-for': '203.0.113.77' });
  await post('/api/oturum/soru', { oturumId: o.veri.oturumId, soru: 'Gizli kelime zürafa ne değişti?' });
  await post('/api/oturum/degerlendir', { oturumId: o.veri.oturumId, tahmin: 'Gizli tahmin papatya' });
  await kapat();
  const { readFileSync, readdirSync } = await import('node:fs');
  const ham = readdirSync(config.dataDir).map((d) => readFileSync(join(config.dataDir, d)).toString('latin1')).join('');
  assert.ok(!ham.includes('203.0.113.77') && !ham.includes('zürafa') && !ham.includes('papatya') && !ham.includes('zürafa'));
});

test('mcp: anahtar zorunlu; araçlar listelenir ve oturum uçtan uca çalışır', async () => {
  const { taban, store } = await baslat({ MCP_ENABLED: 'true', MCP_ANAHTARLARI: ANAHTAR, MCP_GUNLUK_OTURUM: '1' });
  assert.equal((await fetch(taban + '/mcp', { method: 'POST', body: '{}' })).status, 401);
  assert.equal((await fetch(taban + '/mcp/' + 'x'.repeat(40), { method: 'POST', body: '{}' })).status, 401);
  assert.equal((await fetch(taban + '/mcp/' + ANAHTAR)).status, 405);

  for (const [adres, basliklar] of [[taban + '/mcp', { Authorization: 'Bearer ' + ANAHTAR }], [taban + '/mcp/' + ANAHTAR, {}]]) {
    const istemci = new Client({ name: 'test', version: '1.0.0' });
    await istemci.connect(new StreamableHTTPClientTransport(new URL(adres), { requestInit: { headers: basliklar } }));
    assert.deepEqual((await istemci.listTools()).tools.map((t) => t.name), MCP_ARAC_ADLARI);
    await istemci.close();
  }

  const istemci = new Client({ name: 'test', version: '1.0.0' });
  await istemci.connect(new StreamableHTTPClientTransport(new URL(taban + '/mcp'), { requestInit: { headers: { Authorization: 'Bearer ' + ANAHTAR } } }));
  const cagir = async (name, args) => {
    const y = await istemci.callTool({ name, arguments: args });
    return { hata: y.isError === true, metin: y.content[0].text };
  };
  const liste = await cagir('senaryo_listele', {});
  assert.ok(!liste.metin.includes('kok_neden') && !liste.metin.includes('gizli_bilgiler'));
  const o = JSON.parse((await cagir('oturum_baslat', { senaryo: 'depo-verim-dususu' })).metin);
  const s = JSON.parse((await cagir('soru_sor', { oturum: o.oturumId, soru: 'Gece ekibinin yapısı nasıl, kimler çalışıyor?' })).metin);
  assert.match(s.cevap, /geçici personel/);
  const r = JSON.parse((await cagir('degerlendir', { oturum: o.oturumId, kok_neden_tahmini: 'Geçici personel ve eğitim eksikliği.' })).metin);
  assert.ok(r.toplam > 0 && r.kokNeden.includes('Adresleme'));
  // MCP'nin kendi günlük limiti var ve web sayaçlarına dokunmaz
  const iki = await cagir('oturum_baslat', { senaryo: 'depo-verim-dususu' });
  assert.ok(iki.hata && /MCP oturum hakkı doldu/.test(iki.metin));
  assert.equal(store.sayi(istanbulGunu(), 'site'), 0);
  const yok = await cagir('soru_sor', { oturum: 'yok', soru: 'x' });
  assert.ok(yok.hata && /Oturum bulunamadı/.test(yok.metin));
  await istemci.close();
});

// --- Kredi biterse / azalırsa ---------------------------------------------------------

test('anthropic: kredi ve yetki hataları sınıflandırılır, yeniden denenmez', async () => {
  const yanit = (status, govde) => async () => ({ ok: false, status, json: async () => govde });
  const dene = async (f) => {
    let sayi = 0;
    const m = anthropicModel({ apiKey: 'k', karakterModeli: 'a', degerlendiriciModeli: 'b', fetch: async () => { sayi++; return f(); } });
    const hata = await m.karakter({ senaryo: { gizli_bilgiler: [], karakter: {}, yaniltici_ipuclari: [] }, gecmis: [], soru: 's', acilanlar: [] }).catch((e) => e);
    return [hata instanceof ModelHatasi, hata.kod, sayi];
  };
  assert.deepEqual(await dene(yanit(402, { error: { type: 'billing_error', message: 'x' } })), [true, 'kredi', 1]);
  assert.deepEqual(await dene(yanit(400, { error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } })), [true, 'kredi', 1]);
  assert.deepEqual(await dene(yanit(401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } })), [true, 'yetki', 1]);
  assert.deepEqual(await dene(yanit(400, { error: { type: 'invalid_request_error', message: 'model: not found' } })), [true, 'istek', 1]);
  assert.deepEqual(await dene(yanit(529, {})), [true, 'gecici', 2]);
});

test('kredi biterse: ziyaretçi açık mesaj görür, hak düşmez, sahibe bir kez bildirilir, yükleme sonrası kendiliğinden açılır', async () => {
  let krediVar = false;
  let an = Date.parse('2026-11-16T09:00:00Z');
  const sahte = sahteModel();
  const model = {
    ad: 'anthropic',
    karakter: async (g) => { if (!krediVar) throw new ModelHatasi('HTTP 402', { kod: 'kredi' }); return sahte.karakter(g); },
    degerlendir: (g) => sahte.degerlendir(g),
  };
  const gonderilen = [];
  const bildirim = { gonder: (olay, metin, o) => { gonderilen.push([olay, o?.acil === true]); return true; } };
  const { taban, post, store } = await baslat({}, { model, bildirim, simdi: () => an });
  const durum = async () => (await fetch(taban + '/api/durum')).json();
  assert.equal((await durum()).kapaliMesaji, null);

  const o = await post('/api/oturum', { senaryoId: 'depo-verim-dususu' });
  const s = await post('/api/oturum/soru', { oturumId: o.veri.oturumId, soru: 'Ne değişti?' });
  assert.deepEqual([s.durum, s.veri.kod], [503, 'kapali']);
  assert.match(s.veri.hata, /kullanım kredisi tükendi/);
  assert.ok(!/402|anthropic/i.test(s.veri.hata)); // teknik ayrıntı ziyaretçiye gitmez
  assert.deepEqual(gonderilen, [['kredi-bitti', true]]);

  // Kapalıyken: durum mesajı gösterir, yeni oturum hak düşmeden reddedilir
  const d = await durum();
  assert.match(d.kapaliMesaji, /örnek oturumu/);
  assert.equal(d.kalanOturum, 2);
  const red = await post('/api/oturum', { senaryoId: 'depo-verim-dususu' });
  assert.equal(red.durum, 429);
  assert.match(red.veri.hata, /kredisi tükendi/);
  assert.equal((await durum()).kalanOturum, 2);
  assert.ok(store.metaOku('kapali').includes('kredi')); // yeniden başlatmada da hatırlanır

  // 30 dakika sonra yeniden denenir; kredi yüklendiyse ilk başarılı cevapta açılır
  an += 31 * 60_000;
  krediVar = true;
  assert.equal((await durum()).kapaliMesaji, null);
  const o2 = await post('/api/oturum', { senaryoId: 'depo-verim-dususu' });
  assert.equal(o2.durum, 200);
  assert.equal((await post('/api/oturum/soru', { oturumId: o2.veri.oturumId, soru: 'Süreçte ne değişti?' })).durum, 200);
  assert.equal(store.metaOku('kapali'), null);
});

test('kredi azalırsa ve site tavanı dolarsa sahibe bildirilir', async () => {
  const gonderilen = [];
  const bildirim = { gonder: (olay, metin) => { gonderilen.push([olay, metin]); return true; } };
  const { post, store, app } = await baslat({ KREDI_USD: '5', KREDI_UYARI_YUZDE: '20', SITE_GUNLUK_OTURUM: '1' }, { bildirim });
  const gun = istanbulGunu();
  store.kullanimKaydet(gun, { tur: 'degerlendirme', model: 'claude-sonnet-5-5', girdi: 1_000_000, cikti: 100_000 }); // 2 + 1 = 3 $
  app.krediKontrol();
  assert.deepEqual(gonderilen, []); // kalan 2 $ > eşik 1 $
  store.kullanimKaydet(gun, { tur: 'degerlendirme', model: 'claude-sonnet-5-5', girdi: 600_000, cikti: 0 }); // +1,2 $ → kalan 0,8 $
  app.krediKontrol();
  assert.equal(gonderilen[0][0], 'kredi-azaldi');
  assert.match(gonderilen[0][1], /kalan kredi 0\.80 \$/);

  assert.equal((await post('/api/oturum', { senaryoId: 'geciken-teslimler' })).durum, 200);
  assert.equal((await post('/api/oturum', { senaryoId: 'geciken-teslimler' }, { 'x-forwarded-for': '198.51.100.9' })).durum, 429);
  assert.equal(gonderilen[1][0], 'site-tavani');
});

test('bildirim: aynı olay günde bir kez gider, adres yoksa yalnızca kayda yazılır, gönderim hatası uygulamayı bozmaz', async () => {
  const { store } = await baslat();
  const istekler = [];
  const kayit = [];
  let gun = '2026-11-16';
  const b = createBildirim({ url: 'https://ntfy.example/konu', store, gun: () => gun, log: (m) => kayit.push(m), fetch: async (url, o) => { istekler.push([url, o.headers.Priority, o.body]); return { ok: true }; } });
  assert.equal(b.gonder('kredi-bitti', 'Kredi bitti.', { acil: true }), true);
  assert.equal(b.gonder('kredi-bitti', 'Kredi bitti.', { acil: true }), false);
  assert.equal(b.gonder('kredi-azaldi', 'Kredi azaldı.'), true);
  gun = '2026-11-17';
  assert.equal(b.gonder('kredi-bitti', 'Kredi bitti.', { acil: true }), true);
  assert.deepEqual(istekler.map((i) => i[1]), ['high', 'default', 'high']);
  assert.equal(istekler[0][0], 'https://ntfy.example/konu');

  const sessiz = createBildirim({ url: '', store, gun: () => '2026-12-01', log: (m) => kayit.push(m), fetch: async () => { throw new Error('çağrılmamalı'); } });
  assert.equal(sessiz.gonder('site-tavani', 'Tavan doldu.'), true);
  assert.ok(kayit.some((m) => m.includes('BİLDİRİM (site-tavani)')));
  const bozuk = createBildirim({ url: 'https://ntfy.example/konu', store, gun: () => '2026-12-02', log: (m) => kayit.push(m), fetch: async () => { throw new TypeError('ağ yok'); } });
  assert.equal(bozuk.gonder('kredi-bitti', 'x'), true);
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(kayit.some((m) => m.includes('Bildirim gönderilemedi')));
});

test('ayarlar: bildirim ve kredi değerleri doğrulanır', () => {
  assert.match(loadConfig({ MODEL_MODE: 'mock', BILDIRIM_URL: 'http://acik.test' }).errors.join(' '), /BILDIRIM_URL/);
  assert.match(loadConfig({ MODEL_MODE: 'mock', KREDI_USD: '-1' }).errors.join(' '), /KREDI_USD/);
  assert.match(loadConfig({ MODEL_MODE: 'mock', KREDI_BASLANGIC: '16.11.2026' }).errors.join(' '), /KREDI_BASLANGIC/);
  const c = loadConfig({ MODEL_MODE: 'mock', BILDIRIM_URL: 'https://ntfy.sh/konu', KREDI_USD: '5', KREDI_BASLANGIC: '2026-11-16' });
  assert.deepEqual([c.errors, c.bildirimUrl, c.krediUsd, c.krediBaslangic, c.krediUyariYuzde], [[], 'https://ntfy.sh/konu', 5, '2026-11-16', 20]);
});

test('varyant: web, oynanan varyantları dışarıda bırakır ve özete yazar; eski veritabanı yükseltilir', async () => {
  const { post, store } = await baslat({}, { varyantSec: undefined }); // gerçek rastgele seçim
  const o = await post('/api/oturum', { senaryoId: 'depo-verim-dususu', oynananVaryantlar: ['v1', 'v2'] });
  assert.equal(o.durum, 200);
  assert.ok(!JSON.stringify(o.veri).includes('"varyant"'));
  await post('/api/oturum/soru', { oturumId: o.veri.oturumId, soru: 'Bu düşüş nasıl ölçülüyor?' });
  const r = await post('/api/oturum/degerlendir', { oturumId: o.veri.oturumId, tahmin: 'Ölçü yanıltıyor.' });
  assert.equal(r.veri.senaryo.varyant, 'v3'); // tek aday v3'tü
  assert.deepEqual(store.istatistik(istanbulGunu()).biten.map((b) => [b.senaryo, b.varyant]), [['depo-verim-dususu', 'v3']]);
  assert.equal((await post('/api/oturum', { senaryoId: 'depo-verim-dususu', oynananVaryantlar: { kotu: 1 } })).durum, 200);

  // Varyant sütunu olmayan eski veritabanı açılınca sütun eklenir, eski kayıtlar v1 sayılır
  const { DatabaseSync } = await import('node:sqlite');
  const dosya = join(mkdtempSync(join(tmpdir(), 'diyalog-eski-')), 'diyalog.db');
  const eski = new DatabaseSync(dosya);
  eski.exec('CREATE TABLE oturum (id INTEGER PRIMARY KEY AUTOINCREMENT, zaman INTEGER NOT NULL, gun TEXT NOT NULL, senaryo TEXT NOT NULL, kanal TEXT NOT NULL, soru_sayisi INTEGER NOT NULL, toplam INTEGER NOT NULL, kritik_acilan INTEGER NOT NULL, sure_sn INTEGER NOT NULL)');
  eski.prepare("INSERT INTO oturum (zaman, gun, senaryo, kanal, soru_sayisi, toplam, kritik_acilan, sure_sn) VALUES (1, '2026-11-17', 'eski', 'web', 3, 50, 1, 60)").run();
  eski.close();
  const yeni = openStore(dosya);
  assert.deepEqual(yeni.istatistik('2026-11-01').biten.map((b) => [b.senaryo, b.varyant]), [['eski', 'v1']]);
  yeni.close();
});
