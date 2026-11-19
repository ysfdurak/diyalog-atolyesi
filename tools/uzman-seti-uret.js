// Uzman puanlı örnek setin taslağını üretir: el yazısı sorular sahte karakterle konuşturulur (cevap ve açılan bilgiler
// sabitlenir), etiketler taslaktan gelir. Kullanım: node tools/uzman-seti-uret.js taslak.json > degerlendirme/uzman-seti.json
// Not: Etiketler bir uzmanın değil, Claude'un hazırladığı TASLAKTIR. Bir eğitmen/İK uzmanı gözden geçirip "durum": "onaylandi"
// yapana kadar karşılaştırma sonuçları yalnız aracın çalıştığını gösterir.
import { readFileSync } from 'node:fs';
import { senaryolariYukle, varyantCozumle } from '../src/cekirdek/senaryolar.js';
import { sahteModel } from '../src/cekirdek/model.js';

const taslak = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const S = senaryolariYukle(new URL('../senaryolar', import.meta.url).pathname);
const model = sahteModel();
const out = [];
for (const t of taslak) {
  const senaryo = varyantCozumle(S.get(t.senaryo), t.varyant);
  const gecmis = [], acilanlar = [];
  for (const [soru] of t.sorular) {
    const y = await model.karakter({ senaryo, gecmis, soru, acilanlar });
    for (const id of y.acilan) if (!acilanlar.includes(id)) acilanlar.push(id);
    gecmis.push({ soru, cevap: y.cevap });
  }
  out.push({
    id: t.id, senaryo: t.senaryo, varyant: t.varyant, seviye: t.seviye, gecmis, acilanlar, tahmin: t.tahmin,
    uzman: { sorular: t.sorular.map(([, e], i) => ({ no: i + 1, ...e })), derinlesme: t.uzman.derinlesme, sonuc: t.uzman.sonuc, not: t.uzman.not },
  });
}
console.log(JSON.stringify({
  durum: 'taslak',
  aciklama: 'Etiketler Claude tarafından hazırlanmış taslaktır; uzman onayı bekliyor. Cevaplar sahte karakterle üretildi (sabit). Bir uzman her öğede uzman alanlarını gözden geçirip durumu "onaylandi" yapmalı.',
  rubrik: 'src/cekirdek/istemler.js › DEGERLENDIRICI_ISTEMI',
  ogeler: out,
}, null, 1));
