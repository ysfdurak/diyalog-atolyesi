// Değerlendirici modeli uzman puanlı örnek setle karşılaştırır ve degerlendirme/son-karsilastirma.md yazar.
// Kullanım:
//   node tools/uzman-karsilastir.js            → sahte (kural tabanlı) değerlendirici: aracın çalıştığını gösterir
//   ANTHROPIC_API_KEY=... node tools/uzman-karsilastir.js --gercek   → gerçek değerlendirici model (DEGERLENDIRICI_MODELI, varsayılan haiku)
// Set taslak durumdaysa (uzman onayı yok) rapor bunu en üstte yazar.
import { readFileSync, writeFileSync } from 'node:fs';
import { senaryolariYukle, varyantCozumle } from '../src/cekirdek/senaryolar.js';
import { sahteModel, anthropicModel } from '../src/cekirdek/model.js';
import { uzmanKarsilastir } from '../src/cekirdek/uzman.js';

const kok = new URL('../', import.meta.url);
const set = JSON.parse(readFileSync(new URL('degerlendirme/uzman-seti.json', kok), 'utf8'));
const S = senaryolariYukle(new URL('senaryolar', kok).pathname);
const gercek = process.argv.includes('--gercek');
if (gercek && !process.env.ANTHROPIC_API_KEY) { console.error('--gercek için ANTHROPIC_API_KEY gerekli.'); process.exit(1); }
const model = gercek
  ? anthropicModel({ apiKey: process.env.ANTHROPIC_API_KEY, karakterModeli: 'claude-haiku-5-5', degerlendiriciModeli: process.env.DEGERLENDIRICI_MODELI || 'claude-haiku-5-5' })
  : sahteModel();
const r = await uzmanKarsilastir(set.ogeler, (id, v) => varyantCozumle(S.get(id), v), (o) => model.degerlendir(o));

const y = (v) => (v === null ? '—' : `%${Math.round(v * 100)}`);
const k = (v) => (v === null ? '—' : v.toFixed(2));
const md = [
  `# Değerlendirici ↔ uzman karşılaştırması`,
  '',
  `Değerlendirici: **${gercek ? (process.env.DEGERLENDIRICI_MODELI || 'claude-haiku-5-5') : 'sahte (kural tabanlı)'}** · set: ${r.ogeSayisi} konuşma, ${r.soruSayisi} soru · tarih: ${new Date().toISOString().slice(0, 10)}`,
  '',
  set.durum !== 'onaylandi' ? `> **Set taslak:** ${set.aciklama} Bu sonuçlar uzman uyumunu değil, aracın çalıştığını gösterir.\n` : '',
  '| Ölçü | Uyum | Not |',
  '| --- | ---: | --- |',
  `| Soru türü (açık/kapalı) | ${y(r.tur.uyum)} · κ ${k(r.tur.kappa)} | Açık uçlu soru boyutunu belirler |`,
  `| Yönlendirici etiketi | ${y(r.yonlendirici.uyum)} · κ ${k(r.yonlendirici.kappa)} | Varsayımsız soru boyutunu belirler |`,
  `| Derinleşme (1–5) | aynı ${y(r.derinlesme.ayni)} · ±1 ${y(r.derinlesme.birFark)} · ort. fark ${k(r.derinlesme.ortMutlakFark)} | Modelin puanladığı boyut |`,
  `| Sonuç (1–5) | aynı ${y(r.sonuc.ayni)} · ±1 ${y(r.sonuc.birFark)} · ort. fark ${k(r.sonuc.ortMutlakFark)} | Modelin puanladığı boyut |`,
  `| Toplam skor (100) | ort. fark ${k(r.toplam.ortMutlakFark)} · en büyük ${r.toplam.enBuyukFark} | Kod boyutları dahil |`,
  '',
  'Kabul ölçütü önerisi (uzman onaylı sette): soru türü ve yönlendirici κ ≥ 0,6; derinleşme ve sonuçta ±1 uyum ≥ %80; toplam skorda ortalama fark ≤ 10.',
  '',
  '## Uyuşmazlıklar',
  '',
  ...r.satirlar.flatMap((s) => [
    `### ${s.id} · ${s.senaryo} (${s.seviye}) · toplam model ${s.toplamModel} / uzman ${s.toplamUzman}`,
    s.farklar.length
      ? s.farklar.map((f) => f.no
        ? `- Soru ${f.no} “${f.soru}”: ${f.tur === 'tur' ? 'tür' : 'yönlendirici'} model **${f.model}**, uzman **${f.uzman}**. Model notu: ${f.modelNotu || '—'}`
        : `- ${f.tur === 'derinlesme' ? 'Derinleşme' : 'Sonuç'}: model **${f.model}**, uzman **${f.uzman}**. Model yorumu: ${f.modelNotu || '—'}${f.tahmin ? ` · Tahmin: “${f.tahmin}”` : ''}`).join('\n')
      : '- Uyuşmazlık yok.',
    '',
  ]),
].join('\n');
writeFileSync(new URL('degerlendirme/son-karsilastirma.md', kok), md);
console.log(md.split('\n').slice(0, 14).join('\n'));
