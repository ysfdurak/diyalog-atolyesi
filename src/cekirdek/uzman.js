// Uzman puanlarıyla karşılaştırma: değerlendirici modelin etiket ve puanlarını, uzmanın aynı konuşmalara verdiği
// etiket ve puanlarla karşılaştırır. Model iki boyutu (derinleşme, sonuç) puanlar ve soruları etiketler (açık/kapalı,
// yönlendirici); diğer boyutlar bu etiketlerden kodla hesaplanır (puanlama.js). Bu yüzden etiket uyumu da ölçülür.
import { degerlendirmeyiDuzelt, puanla } from './puanlama.js';

/** Cohen kappa: iki değerlendiricinin ikili etiket uyumu, şans eseri uyum düşülerek. */
export function kappa(a, b) {
  const n = a.length;
  if (!n) return null;
  const uyum = a.filter((x, i) => x === b[i]).length / n;
  const etiketler = [...new Set([...a, ...b])];
  const sans = etiketler.reduce((t, e) => t + (a.filter((x) => x === e).length / n) * (b.filter((x) => x === e).length / n), 0);
  return sans === 1 ? (uyum === 1 ? 1 : 0) : (uyum - sans) / (1 - sans);
}

/**
 * @param {Array} ogeler      uzman-seti.json › ogeler
 * @param {Map} senaryolar    kimlik → senaryo (varyantCozumle ile çözülmüş olmalı: (id, varyant) => senaryo)
 * @param {(o) => Promise<object>} degerlendir  modelin ham değerlendirmesi
 */
export async function uzmanKarsilastir(ogeler, cozumle, degerlendir) {
  const satirlar = [], tur = { m: [], u: [] }, yon = { m: [], u: [] }, der = [], son = [], toplam = [];
  for (const o of ogeler) {
    const senaryo = cozumle(o.senaryo, o.varyant);
    const ham = await degerlendir({ senaryo, gecmis: o.gecmis, acilanlar: o.acilanlar, tahmin: o.tahmin });
    const m = degerlendirmeyiDuzelt(ham, o.gecmis.length);
    const u = degerlendirmeyiDuzelt({ sorular: o.uzman.sorular, derinlesme: { puan: o.uzman.derinlesme }, sonuc: { puan: o.uzman.sonuc } }, o.gecmis.length);
    const farklar = [];
    m.sorular.forEach((s, i) => {
      const e = u.sorular[i];
      tur.m.push(s.tur); tur.u.push(e.tur); yon.m.push(s.yonlendirici); yon.u.push(e.yonlendirici);
      if (s.tur !== e.tur) farklar.push({ tur: 'tur', no: s.no, soru: o.gecmis[i].soru, model: s.tur, uzman: e.tur, modelNotu: s.not });
      if (s.yonlendirici !== e.yonlendirici) farklar.push({ tur: 'yonlendirici', no: s.no, soru: o.gecmis[i].soru, model: s.yonlendirici, uzman: e.yonlendirici, modelNotu: s.not });
    });
    der.push([m.derinlesme.puan, u.derinlesme.puan]);
    son.push([m.sonuc.puan, u.sonuc.puan]);
    if (Math.abs(m.derinlesme.puan - u.derinlesme.puan) > 1) farklar.push({ tur: 'derinlesme', model: m.derinlesme.puan, uzman: u.derinlesme.puan, modelNotu: m.derinlesme.yorum, dayanak: m.derinlesme.dayanak });
    if (Math.abs(m.sonuc.puan - u.sonuc.puan) > 1) farklar.push({ tur: 'sonuc', model: m.sonuc.puan, uzman: u.sonuc.puan, modelNotu: m.sonuc.yorum, tahmin: o.tahmin });
    const ts = (d) => puanla({ senaryo, acilanlar: o.acilanlar, degerlendirme: d, gecmis: o.gecmis }).toplam;
    const tm = ts(m), tu = ts(u);
    toplam.push([tm, tu]);
    satirlar.push({ id: o.id, senaryo: o.senaryo, seviye: o.seviye, toplamModel: tm, toplamUzman: tu, farklar });
  }
  const oran = (v) => (v.length ? v.filter(([a, b]) => a === b).length / v.length : null);
  const yakin = (v) => (v.length ? v.filter(([a, b]) => Math.abs(a - b) <= 1).length / v.length : null);
  const ort = (v) => (v.length ? v.reduce((t, [a, b]) => t + Math.abs(a - b), 0) / v.length : null);
  return {
    ogeSayisi: ogeler.length,
    soruSayisi: tur.m.length,
    tur: { uyum: tur.m.filter((x, i) => x === tur.u[i]).length / (tur.m.length || 1), kappa: kappa(tur.m, tur.u) },
    yonlendirici: { uyum: yon.m.filter((x, i) => x === yon.u[i]).length / (yon.m.length || 1), kappa: kappa(yon.m, yon.u) },
    derinlesme: { ayni: oran(der), birFark: yakin(der), ortMutlakFark: ort(der) },
    sonuc: { ayni: oran(son), birFark: yakin(son), ortMutlakFark: ort(son) },
    toplam: { ortMutlakFark: ort(toplam), enBuyukFark: Math.max(...toplam.map(([a, b]) => Math.abs(a - b))) },
    satirlar,
  };
}
