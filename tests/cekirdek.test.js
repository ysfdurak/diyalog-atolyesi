// Çekirdek testleri: senaryo doğrulama, puanlama, oturum kuralları (sahte modelle), Anthropic çağrısı (sahte fetch ile).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gununSenaryosu, herkeseAcik, senaryoDogrula, senaryolariYukle } from '../src/cekirdek/senaryolar.js';
import { BOYUTLAR, degerlendirmeyiDuzelt, orandanPuana, puanla } from '../src/cekirdek/puanlama.js';
import { KuralHatasi, oturumServisi } from '../src/cekirdek/oturum.js';
import { anthropicModel, ModelHatasi, sahteModel } from '../src/cekirdek/model.js';
import { karakterIstemi } from '../src/cekirdek/istemler.js';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const senaryolar = senaryolariYukle(join(kok, 'senaryolar'));
const depo = senaryolar.get('depo-verim-dususu');
const serbest = () => ({ izin: true });

test('senaryolar: üç senaryo geçerli ve ağırlıklar 100 ediyor', () => {
  assert.equal(senaryolar.size, 3);
  for (const s of senaryolar.values()) assert.deepEqual(senaryoDogrula(s), []);
  assert.equal(BOYUTLAR.reduce((t, b) => t + b.agirlik, 0), 100);
});

test('senaryolar: oyuncuya giden veride gizli bilgi ve kök neden yok', () => {
  const acik = JSON.stringify(herkeseAcik(depo));
  assert.ok(!acik.includes('adresleme düzeni'));
  assert.ok(!acik.includes(depo.kok_neden));
  assert.ok(!('gizli_bilgiler' in herkeseAcik(depo)));
});

test('senaryolar: hatalı senaryo nedenleriyle reddedilir', () => {
  const h = senaryoDogrula({ ...depo, id: 'Geçersiz Kimlik', soru_hakki: 0, gizli_bilgiler: [{ id: 'x', onem: 'destek', bilgi: 'b', acilma_kosulu: 'k' }] });
  assert.ok(h.some((x) => x.includes('"id"')));
  assert.ok(h.some((x) => x.includes('soru_hakki')));
  assert.ok(h.some((x) => x.includes('kritik')));
});

test('senaryolar: günün senaryosu gün içinde sabit, günler arasında dönüyor', () => {
  assert.equal(gununSenaryosu(senaryolar, '2026-11-16').id, gununSenaryosu(senaryolar, '2026-11-16').id);
  const uc = new Set(['2026-11-16', '2026-11-17', '2026-11-18'].map((g) => gununSenaryosu(senaryolar, g).id));
  assert.equal(uc.size, 3);
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
  const servis = oturumServisi({ senaryolar, model: sahteModel(), limit: serbest, kaydet: (o) => kayitlar.push(o) });
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
  const servis = oturumServisi({ senaryolar, model: sahteModel(), limit: serbest });
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
  const servis = oturumServisi({ senaryolar, model: sahteModel(), limit: () => ({ izin: false, mesaj: 'Hak doldu.' }), simdi: () => an });
  assert.throws(() => servis.baslat({ senaryoId: 'depo-verim-dususu' }), (e) => e.durum === 429 && e.message === 'Hak doldu.');
  const servis2 = oturumServisi({ senaryolar, model: sahteModel(), limit: serbest, simdi: () => an });
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
  const servis = oturumServisi({ senaryolar, model, limit: serbest });
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
  const servis = oturumServisi({ senaryolar, model, limit: serbest });
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
