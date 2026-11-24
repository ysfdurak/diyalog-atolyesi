// Çekirdek testleri: senaryo doğrulama, puanlama, oturum kuralları (sahte modelle), Anthropic çağrısı (sahte fetch ile).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gununSenaryosu, herkeseAcik, senaryoDogrula, senaryolariYukle, varyantCozumle } from '../src/cekirdek/senaryolar.js';
import { BOYUTLAR, degerlendirmeyiDuzelt, orandanPuana, puanla } from '../src/cekirdek/puanlama.js';
import { KuralHatasi, oturumServisi } from '../src/cekirdek/oturum.js';
import { anthropicModel, ModelHatasi, sahteModel } from '../src/cekirdek/model.js';
import { karakterIstemi } from '../src/cekirdek/istemler.js';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const senaryolar = senaryolariYukle(join(kok, 'senaryolar'));
const depoTemel = senaryolar.get('depo-verim-dususu');
const depo = varyantCozumle(depoTemel, 'v1');
const serbest = () => ({ izin: true });
const ilkVaryant = (a) => a[0]; // testlerde varyant seçimi sabit: adaylardan ilki

test('senaryolar: on senaryo geçerli, alan dağılımı ve ağırlıklar 100 ediyor', () => {
  assert.equal(senaryolar.size, 10);
  const alanlar = {};
  for (const s of senaryolar.values()) alanlar[s.alan] = (alanlar[s.alan] || 0) + 1;
  assert.deepEqual(alanlar, { 'İş geliştirme': 3, Operasyon: 3, 'Ekip yönetimi': 3, 'Proje yönetimi': 1 });
  // Yeni senaryolar baştan üç kök nedenli
  for (const id of ['sayim-farki', 'yeni-hizmet', 'terfi-reddi', 'proje-gecikmesi']) assert.equal(senaryolar.get(id).varyantlar.length, 3, id);
  for (const s of senaryolar.values()) for (const v of s.varyantlar) assert.equal(v.gizli_bilgiler.filter((b) => b.onem === 'kritik').length, 3, `${s.id}/${v.id}`);
  assert.equal(depoTemel.varyantlar.length, 3);
  for (const s of senaryolar.values()) assert.deepEqual(senaryoDogrula(s), []);
  assert.equal(BOYUTLAR.reduce((t, b) => t + b.agirlik, 0), 100);
});

test('senaryolar: oyuncuya giden veride gizli bilgi ve kök neden yok', () => {
  const acik = JSON.stringify(herkeseAcik(depoTemel));
  for (const v of depoTemel.varyantlar) {
    assert.ok(!acik.includes(v.kok_neden));
    for (const b of v.gizli_bilgiler) assert.ok(!acik.includes(b.bilgi), b.id);
  }
  assert.ok(!('gizli_bilgiler' in herkeseAcik(depoTemel)));
  assert.deepEqual(herkeseAcik(depoTemel).varyantlar, ['v1', 'v2', 'v3']);
});

test('senaryolar: hatalı senaryo nedenleriyle reddedilir', () => {
  const h = senaryoDogrula({ ...depo, id: 'Geçersiz Kimlik', soru_hakki: 0, gizli_bilgiler: [{ id: 'x', onem: 'destek', bilgi: 'b', acilma_kosulu: 'k' }] });
  assert.ok(h.some((x) => x.includes('"id"')));
  assert.ok(h.some((x) => x.includes('soru_hakki')));
  assert.ok(h.some((x) => x.includes('kritik')));
});

test('senaryolar: günün senaryosu gün içinde sabit, günler arasında dönüyor', () => {
  assert.equal(gununSenaryosu(senaryolar, '2026-11-16').id, gununSenaryosu(senaryolar, '2026-11-16').id);
  const alti = new Set(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'].map((g) => gununSenaryosu(senaryolar, g).id));
  assert.equal(alti.size, 6);
});

test('puanlama: oran 1-5 aralığına çevrilir', () => {
  assert.deepEqual([0, 0.5, 1, 2, -1].map(orandanPuana), [1, 3, 5, 5, 1]);
});

test('puanlama: kusursuz oturum 100, en kötü oturum 20 alır', () => {
  const iyi = degerlendirmeyiDuzelt({
    sorular: [1, 2, 3].map((no) => ({ no, tur: 'acik', yonlendirici: false, not: '', daha_iyi: '' })),
    derinlesme: { puan: 5, yorum: '' }, sonuc: { puan: 5, yorum: '' }, ozet: '',
  }, 3);
  assert.equal(puanla({ senaryo: depo, acilanlar: ['adresleme', 'gecici-personel', 'el-terminali'], degerlendirme: iyi }).toplam, 100);
  const kotu = degerlendirmeyiDuzelt({
    sorular: [1, 2].map((no) => ({ no, tur: 'kapali', yonlendirici: true })),
    derinlesme: { puan: 1 }, sonuc: { puan: 1 },
  }, 2);
  assert.equal(puanla({ senaryo: depo, acilanlar: ['adres-hatasi'], degerlendirme: kotu }).toplam, 20);
});

test('puanlama: destek bilgisi keşif puanını etkilemez, kritiklerin oranı belirler', () => {
  const d = degerlendirmeyiDuzelt({ sorular: [{ no: 1, tur: 'acik', yonlendirici: false }], derinlesme: { puan: 3 }, sonuc: { puan: 3 } }, 1);
  const skor = puanla({ senaryo: depo, acilanlar: ['adresleme', 'adres-hatasi'], degerlendirme: d });
  assert.equal(skor.kritikAcilan, 1);
  assert.equal(skor.boyutlar.find((b) => b.anahtar === 'kesif').puan, 2); // 1/3 → 1 + round(1.33) = 2
});

test('puanlama: bozuk model çıktısı güvenli varsayılanlara çekilir', () => {
  const d = degerlendirmeyiDuzelt({ sorular: 'yok', derinlesme: { puan: 99 }, sonuc: { puan: 'abc' } }, 2);
  assert.equal(d.sorular.length, 2);
  assert.deepEqual(d.sorular.map((s) => s.tur), ['kapali', 'kapali']);
  assert.equal(d.derinlesme.puan, 5);
  assert.equal(d.sonuc.puan, 3);
  assert.equal(degerlendirmeyiDuzelt(null, 1).sorular.length, 1);
});

test('oturum: baştan sona akış, gizli bilgi yalnızca raporda görünür', async () => {
  const kayitlar = [];
  const servis = oturumServisi({ varyantSec: ilkVaryant, senaryolar, model: sahteModel(), limit: serbest, kaydet: (o) => kayitlar.push(o) });
  const b = servis.baslat({ senaryoId: 'depo-verim-dususu' });
  assert.equal(b.kalanSoru, 5);
  const c1 = await servis.soruSor({ oturumId: b.oturumId, soru: 'Verim düşmeden önce süreçte ne değişti?' });
  assert.match(c1.cevap, /adresleme/);
  assert.equal(c1.kalanSoru, 4);
  assert.deepEqual(Object.keys(c1).sort(), ['cevap', 'kalanSoru', 'soruNo']); // açılan bilgi kimliği oyun sırasında dönmez
  const c2 = await servis.soruSor({ oturumId: b.oturumId, soru: 'Ekip isteksiz mi?' });
  assert.ok(!/geçici/.test(c2.cevap));
  const rapor = await servis.degerlendir({ oturumId: b.oturumId, tahmin: 'Adresleme değişti, gece ekibine eğitim verilmedi.' });
  assert.equal(rapor.sorular.length, 2);
  assert.equal(rapor.sorular[0].tur, 'acik');
  assert.equal(rapor.sorular[1].yonlendirici, true);
  assert.equal(rapor.acilanlar.length, 1);
  assert.equal(rapor.kacirilanlar.length, 3);
  assert.equal(rapor.kokNeden, depo.kok_neden);
  assert.ok(rapor.toplam > 20 && rapor.toplam < 100);
  assert.deepEqual(kayitlar.map((k) => [k.senaryo, k.soruSayisi, k.toplam]), [['depo-verim-dususu', 2, rapor.toplam]]);
  // Rapor bir kez üretilir; ikinci çağrı aynısını döner, model yeniden çağrılmaz
  assert.equal(await servis.degerlendir({ oturumId: b.oturumId, tahmin: 'başka' }), rapor);
  await assert.rejects(servis.soruSor({ oturumId: b.oturumId, soru: 'Bir soru daha?' }), /soru aşaması bitti/);
});

test('oturum: soru hakkı, uzunluk, boş soru ve bilinmeyen oturum kuralları', async () => {
  const servis = oturumServisi({ varyantSec: ilkVaryant, senaryolar, model: sahteModel(), limit: serbest });
  const { oturumId } = servis.baslat({ senaryoId: 'geciken-teslimler' });
  await assert.rejects(servis.degerlendir({ oturumId, tahmin: 'x' }), /en az bir soru/);
  await assert.rejects(servis.soruSor({ oturumId, soru: '   ' }), /boş olamaz/);
  await assert.rejects(servis.soruSor({ oturumId, soru: 'a'.repeat(301) }), /en fazla 300/);
  for (let i = 0; i < 5; i++) await servis.soruSor({ oturumId, soru: `Soru ${i}?` });
  await assert.rejects(servis.soruSor({ oturumId, soru: 'Altıncı?' }), /Soru hakkın bitti/);
  assert.throws(() => servis.soruSor({ oturumId: 'yok', soru: 'x' }), KuralHatasi);
  assert.throws(() => servis.baslat({ senaryoId: 'olmayan' }), /senaryo yok/);
});

test('oturum: limit doluysa oturum açılmaz, süresi dolan oturum silinir', async () => {
  let an = 1_000_000;
  const servis = oturumServisi({ varyantSec: ilkVaryant, senaryolar, model: sahteModel(), limit: () => ({ izin: false, mesaj: 'Hak doldu.' }), simdi: () => an });
  assert.throws(() => servis.baslat({ senaryoId: 'depo-verim-dususu' }), (e) => e.durum === 429 && e.message === 'Hak doldu.');
  const servis2 = oturumServisi({ varyantSec: ilkVaryant, senaryolar, model: sahteModel(), limit: serbest, simdi: () => an });
  const { oturumId } = servis2.baslat({ senaryoId: 'depo-verim-dususu' });
  an += 46 * 60_000;
  assert.throws(() => servis2.soruSor({ oturumId, soru: 'Ne değişti?' }), /süresi doldu/);
  servis2.supur();
  assert.equal(servis2.acikOturumSayisi(), 0);
});

test('oturum: model tanımsız kimlik açarsa yok sayılır; model hatasında soru hakkı düşmez', async () => {
  let hata = true;
  const model = {
    async karakter() {
      if (hata) throw new ModelHatasi('servis yok');
      return { cevap: 'Cevap.', acilan: ['uydurma', 'adresleme', 'adresleme'] };
    },
    async degerlendir() { return {}; },
  };
  const servis = oturumServisi({ varyantSec: ilkVaryant, senaryolar, model, limit: serbest });
  const { oturumId } = servis.baslat({ senaryoId: 'depo-verim-dususu' });
  await assert.rejects(servis.soruSor({ oturumId, soru: 'Ne değişti?' }), ModelHatasi);
  hata = false;
  const c = await servis.soruSor({ oturumId, soru: 'Ne değişti?' });
  assert.equal(c.kalanSoru, 4);
  const rapor = await servis.degerlendir({ oturumId, tahmin: '' });
  assert.equal(rapor.acilanlar.length, 1);
});

test('oturum: aynı oturumda eşzamanlı ikinci istek reddedilir', async () => {
  let birak;
  const model = { karakter: () => new Promise((r) => { birak = () => r({ cevap: 'Tamam.', acilan: [] }); }), degerlendir: async () => ({}) };
  const servis = oturumServisi({ varyantSec: ilkVaryant, senaryolar, model, limit: serbest });
  const { oturumId } = servis.baslat({ senaryoId: 'depo-verim-dususu' });
  const ilk = servis.soruSor({ oturumId, soru: 'Bir?' });
  await assert.rejects(servis.soruSor({ oturumId, soru: 'İki?' }), /hâlâ işleniyor/);
  birak();
  assert.equal((await ilk).kalanSoru, 4);
});

test('istem: karakter istemi gizli bilgileri ve kuralları içerir', () => {
  const istem = karakterIstemi(depo, ['adresleme']);
  assert.ok(istem.includes('kimlik: el-terminali'));
  assert.ok(istem.includes('şimdiye kadar söylediğin bilgiler: adresleme'));
  assert.ok(istem.includes('Karakterden asla çıkma'));
});

test('anthropic: istek biçimi, araç cevabının okunması ve kullanım kaydı', async () => {
  const istekler = [];
  const kullanim = [];
  const sahteFetch = async (url, o) => {
    istekler.push({ url, headers: o.headers, body: JSON.parse(o.body) });
    return { ok: true, status: 200, json: async () => ({ usage: { input_tokens: 900, output_tokens: 40 }, content: [{ type: 'tool_use', name: 'cevapla', input: { cevap: 'Yeni düzen geldi.', acilan_bilgiler: ['adresleme'] } }] }) };
  };
  const model = anthropicModel({ apiKey: 'test-anahtari', karakterModeli: 'model-a', degerlendiriciModeli: 'model-b', fetch: sahteFetch, kullanim: (k) => kullanim.push(k) });
  const y = await model.karakter({ senaryo: depo, gecmis: [{ soru: 'İlk?', cevap: 'İlk cevap.' }], soru: 'Ne değişti?', acilanlar: [] });
  assert.deepEqual(y, { cevap: 'Yeni düzen geldi.', acilan: ['adresleme'] });
  const { url, headers, body } = istekler[0];
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(headers['x-api-key'], 'test-anahtari');
  assert.equal(body.model, 'model-a');
  assert.deepEqual(body.tool_choice, { type: 'tool', name: 'cevapla' });
  assert.deepEqual(body.messages.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.deepEqual(kullanim, [{ tur: 'karakter', model: 'model-a', girdi: 900, cikti: 40 }]);
});

test('anthropic: geçici hatada bir kez yeniden dener, kalıcı hatada ModelHatasi verir', async () => {
  let sayi = 0;
  const gecici = async () => (++sayi === 1
    ? { ok: false, status: 529 }
    : { ok: true, status: 200, json: async () => ({ content: [{ type: 'tool_use', name: 'raporla', input: { ozet: 'tamam' } }] }) });
  const m1 = anthropicModel({ apiKey: 'k', karakterModeli: 'a', degerlendiriciModeli: 'b', fetch: gecici });
  assert.equal((await m1.degerlendir({ senaryo: depo, gecmis: [{ soru: 's', cevap: 'c' }], acilanlar: [], tahmin: 't' })).ozet, 'tamam');
  assert.equal(sayi, 2);
  const m2 = anthropicModel({ apiKey: 'k', karakterModeli: 'a', degerlendiriciModeli: 'b', fetch: async () => ({ ok: false, status: 401 }) });
  await assert.rejects(m2.karakter({ senaryo: depo, gecmis: [], soru: 's', acilanlar: [] }), ModelHatasi);
  const m3 = anthropicModel({ apiKey: 'k', karakterModeli: 'a', degerlendiriciModeli: 'b', fetch: async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'serbest metin' }] }) }) });
  await assert.rejects(m3.karakter({ senaryo: depo, gecmis: [], soru: 's', acilanlar: [] }), /beklenen biçimde/);
});

test('senaryolar: her varyantta iyi sorular kritik bilgiyi açar, suçlayıcı soru açmaz (sahte modelle)', async () => {
  for (const s of senaryolar.values()) {
    for (const { id: vid } of s.varyantlar) {
      const v = varyantCozumle(s, vid);
      const servis = oturumServisi({ varyantSec: () => vid, senaryolar, model: sahteModel(), limit: serbest });
      const { oturumId } = servis.baslat({ senaryoId: s.id });
      await servis.soruSor({ oturumId, soru: 'Ekip isteksiz, değil mi?' });
      for (const soru of v.ideal_sorular.slice(0, 4)) await servis.soruSor({ oturumId, soru });
      const rapor = await servis.degerlendir({ oturumId, tahmin: v.kok_neden });
      const ad = `${s.id}/${vid}`;
      assert.equal(rapor.senaryo.varyant, vid, ad);
      assert.equal(rapor.sorular[0].yonlendirici, true, ad);
      assert.ok(rapor.acilanlar.filter((b) => b.onem === 'kritik').length >= 2, `${ad}: ideal sorular en az iki kritik bilgiyi açmalı`);
      assert.equal(rapor.boyutlar.find((b) => b.anahtar === 'sonuc').puan, 5, ad);
    }
  }
});

test('varyant: doğrulama kuralları', () => {
  const { varyantlar, ...temel } = depoTemel;
  const v = varyantlar[0];
  assert.deepEqual(senaryoDogrula(depoTemel), []);
  assert.match(senaryoDogrula({ ...temel, varyantlar: [] }).join(' '), /boş olmayan bir liste/);
  assert.match(senaryoDogrula({ ...temel, kok_neden: 'üstte', varyantlar }).join(' '), /her varyantın içinde/);
  assert.match(senaryoDogrula({ ...temel, varyantlar: [v, { ...v }] }).join(' '), /yineleniyor: v1/);
  assert.match(senaryoDogrula({ ...temel, varyantlar: [{ ...v, id: 'V 2' }] }).join(' '), /"id" alanı olmalı/);
  assert.match(senaryoDogrula({ ...temel, varyantlar: [{ ...v, kok_neden: '' }] }).join(' '), /Varyant "v1": "kok_neden"/);
  // Eski biçim (varyantsız) tek varyant sayılır
  const eski = senaryolariYukle(join(kok, 'senaryolar')).get('musteri-sozlesme');
  assert.deepEqual(eski.varyantlar.map((x) => x.id), ['v1']);
  assert.ok(!('gizli_bilgiler' in eski));
  assert.throws(() => varyantCozumle(eski, 'v9'), /varyantı yok/);
});

test('varyant: oynanmamış olandan seçilir, hepsi oynandıysa tümünden; ortak alanlar varyantta ezilebilir', async () => {
  const gorulen = [];
  const servis = oturumServisi({ varyantSec: (a) => { gorulen.push([...a]); return a[a.length - 1]; }, senaryolar, model: sahteModel(), limit: serbest });
  const b1 = servis.baslat({ senaryoId: 'depo-verim-dususu', oynananlar: ['v1'] });
  assert.ok(!('varyant' in b1.senaryo) && !JSON.stringify(b1).includes('kok_neden')); // seçilen varyant oyun sırasında söylenmez
  servis.baslat({ senaryoId: 'depo-verim-dususu', oynananlar: ['v1', 'v2', 'v3'] });
  servis.baslat({ senaryoId: 'depo-verim-dususu', oynananlar: 'bozuk' });
  assert.deepEqual(gorulen, [['v2', 'v3'], ['v1', 'v2', 'v3'], ['v1', 'v2', 'v3']]);
  await servis.soruSor({ oturumId: b1.oturumId, soru: 'Bu düşüş nasıl ölçülüyor?' });
  const rapor = await servis.degerlendir({ oturumId: b1.oturumId, tahmin: '' });
  assert.deepEqual([rapor.senaryo.varyant, rapor.senaryo.varyantNo, rapor.senaryo.varyantSayisi], ['v3', 3, 3]);
  assert.equal(rapor.idealSorular[1], 'Bu %18\'lik düşüş nasıl ölçülüyor?'); // v3'ün kendi soruları
  assert.equal(varyantCozumle(depoTemel, 'v2').ideal_sorular, depoTemel.ideal_sorular); // v2 ortak soruları kullanır
  assert.equal(varyantCozumle(depoTemel, 'v2').yaniltici_ipuclari, depoTemel.yaniltici_ipuclari);
});

// Dış inceleme (Kasım 2026): puanın kullanıcının kendi sorusundan dayanağı ve uzman setiyle karşılaştırma.
import { uzmanKarsilastir, kappa } from '../src/cekirdek/uzman.js';
import { readFileSync as okuDosya } from 'node:fs';

test('dayanak: soru metni oturum kaydından gelir, model uydurduğu numarayı ekleyemez', async () => {
  const { degerlendirmeyiDuzelt: duzelt, puanla: p } = await import('../src/cekirdek/puanlama.js');
  const gecmis = [{ soru: 'Gece ekibi isteksiz mi?', cevap: 'Olabilir.' }, { soru: 'Son üç haftada neler değişti?', cevap: 'Adresleme değişti.' }, { soru: 'Adresleme değişikliği nasıl anlatıldı?', cevap: 'Anlatılmadı.' }];
  const d = duzelt({ sorular: [{ no: 1, tur: 'kapali', yonlendirici: true }, { no: 2, tur: 'acik' }, { no: 3, tur: 'acik' }], derinlesme: { puan: 4, dayanak_sorular: [3, 9, 3, 'x'] }, sonuc: { puan: 5, dayanak: 'adresleme eğitimi' } }, 3);
  assert.deepEqual(d.derinlesme.dayanak, [3]);
  const senaryo = { gizli_bilgiler: [{ id: 'a', onem: 'kritik', bilgi: 'x' }] };
  const r = p({ senaryo, acilanlar: [], degerlendirme: d, gecmis, tahmin: 'Adresleme eğitimi gece verilmedi.' });
  const b = Object.fromEntries(r.boyutlar.map((x) => [x.anahtar, x]));
  assert.deepEqual(b.derinlesme.dayanak, [{ no: 3, soru: 'Adresleme değişikliği nasıl anlatıldı?', etiket: '' }]);
  assert.deepEqual(b.varsayimsiz.dayanak, [{ no: 1, soru: 'Gece ekibi isteksiz mi?', etiket: 'yönlendirici' }]);
  assert.deepEqual(b.acik.dayanak.map((x) => x.no), [1]);
  assert.deepEqual(b.sonuc.dayanak, [{ alinti: 'adresleme eğitimi' }], 'alıntı tahminde geçiyorsa olduğu gibi');
  assert.equal(b.derinlesme.kaynak, 'model'); assert.equal(b.acik.kaynak, 'kod');
  const uydurma = p({ senaryo, acilanlar: [], degerlendirme: duzelt({ sonuc: { puan: 5, dayanak: 'hiç yazılmamış cümle' } }, 3), gecmis, tahmin: 'Kısa tahmin.' });
  assert.deepEqual(uydurma.boyutlar.find((x) => x.anahtar === 'sonuc').dayanak, [{ alinti: 'Kısa tahmin.' }], 'tahminde olmayan alıntı yerine tahminin kendisi');
});

test('uzman seti: geçerli yapı ve karşılaştırma ölçüleri (sahte değerlendiriciyle)', async () => {
  const set = JSON.parse(okuDosya(new URL('../degerlendirme/uzman-seti.json', import.meta.url), 'utf8'));
  const { senaryolariYukle, varyantCozumle } = await import('../src/cekirdek/senaryolar.js');
  const S = senaryolariYukle(new URL('../senaryolar', import.meta.url).pathname);
  assert.ok(['taslak', 'onaylandi'].includes(set.durum));
  for (const o of set.ogeler) {
    const s = varyantCozumle(S.get(o.senaryo), o.varyant);
    assert.equal(o.uzman.sorular.length, o.gecmis.length, o.id);
    assert.ok(o.gecmis.length <= s.soru_hakki, o.id);
    assert.ok(o.acilanlar.every((id) => s.gizli_bilgiler.some((b) => b.id === id)), o.id);
    assert.ok([1, 2, 3, 4, 5].includes(o.uzman.derinlesme) && [1, 2, 3, 4, 5].includes(o.uzman.sonuc), o.id);
  }
  const { sahteModel: sahte } = await import('../src/cekirdek/model.js');
  const r = await uzmanKarsilastir(set.ogeler, (id, v) => varyantCozumle(S.get(id), v), (x) => sahte().degerlendir(x));
  assert.equal(r.ogeSayisi, set.ogeler.length);
  assert.ok(r.tur.uyum >= 0 && r.tur.uyum <= 1 && r.derinlesme.birFark !== null);
  assert.equal(kappa([true, false, true], [true, false, true]), 1);
  assert.equal(kappa(['a', 'a'], ['a', 'a']), 1);
  assert.ok(Math.abs(kappa(['a', 'b', 'a', 'b'], ['a', 'a', 'b', 'b'])) < 1e-12, 'şans düzeyinde uyum = 0');
});
