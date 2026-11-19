// Puanlama rubriği (soru modu). Beş boyut 1-5 arası puanlanır, ağırlıklarla 100'lük skora çevrilir.
//
// Hangi puan nereden gelir?
//   Açık uçlu soru   → kodla: değerlendiricinin soru soru verdiği "açık/kapalı" etiketlerinin oranı
//   Varsayımsız soru → kodla: "yönlendirici" etiketi almayan soruların oranı
//   Bilgi keşfi      → kodla: senaryodaki kritik bilgilerden kaçının açıldığı (model etiketi değil, oturum kaydı)
//   Derinleşme       → değerlendirici model, yazılı rubriğe göre
//   Sonuç            → değerlendirici model, kök neden tahminini senaryodaki kök nedenle karşılaştırarak
// Yani model soruları etiketler ve iki boyutu puanlar; toplamı ve diğer üç boyutu bu dosya hesaplar.

export const BOYUTLAR = [
  { anahtar: 'acik', ad: 'Açık uçlu soru', agirlik: 20, aciklama: 'Sorular "ne, nasıl, neler" ile mi açılıyor, yoksa evet/hayır mı?' },
  { anahtar: 'derinlesme', ad: 'Derinleşme', agirlik: 20, aciklama: 'Alınan cevap bir sonraki soruda kullanılıyor mu?' },
  { anahtar: 'varsayimsiz', ad: 'Varsayımsız soru', agirlik: 15, aciklama: 'Soru, cevabı ya da suçlamayı içinde taşımıyor mu?' },
  { anahtar: 'kesif', ad: 'Bilgi keşfi', agirlik: 25, aciklama: 'Kritik bilgilerin kaçı ortaya çıktı?' },
  { anahtar: 'sonuc', ad: 'Sonuç', agirlik: 20, aciklama: 'Kök neden tahmini doğru ve gerekçeli mi?' },
];

const sinirla = (n, alt, ust) => Math.min(ust, Math.max(alt, n));
const puan15 = (v, varsayilan = 3) => (Number.isFinite(Number(v)) ? sinirla(Math.round(Number(v)), 1, 5) : varsayilan);
const kisa = (v, uzunluk = 400) => (typeof v === 'string' ? v.trim().slice(0, uzunluk) : '');

/** Orandan (0-1) 1-5 puana: 0 → 1, 0.5 → 3, 1 → 5 */
export const orandanPuana = (oran) => 1 + Math.round(4 * sinirla(oran, 0, 1));

/**
 * Modelden gelen ham değerlendirmeyi güvenli ve eksiksiz hale getirir.
 * Model bir soruyu atlar ya da aralık dışı puan verirse rapor yine de tutarlı çıkar.
 */
export function degerlendirmeyiDuzelt(ham, soruSayisi) {
  const h = ham && typeof ham === 'object' ? ham : {};
  const gelen = Array.isArray(h.sorular) ? h.sorular : [];
  const sorular = [];
  for (let no = 1; no <= soruSayisi; no++) {
    const s = gelen.find((x) => Number(x?.no) === no) || gelen[no - 1] || {};
    sorular.push({
      no,
      tur: s.tur === 'acik' ? 'acik' : 'kapali',
      yonlendirici: s.yonlendirici === true,
      not: kisa(s.not, 300),
      dahaIyi: kisa(s.daha_iyi ?? s.dahaIyi, 300),
    });
  }
  return {
    sorular,
    derinlesme: {
      puan: puan15(h.derinlesme?.puan), yorum: kisa(h.derinlesme?.yorum),
      // Model yalnız numara verir; metin her zaman oturum kaydından alınır (model alıntı uyduramaz).
      dayanak: [...new Set((Array.isArray(h.derinlesme?.dayanak_sorular) ? h.derinlesme.dayanak_sorular : []).map(Number))]
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= soruSayisi).slice(0, 3),
    },
    sonuc: { puan: puan15(h.sonuc?.puan), yorum: kisa(h.sonuc?.yorum), dayanak: kisa(h.sonuc?.dayanak, 160) },
    ozet: kisa(h.ozet, 600),
  };
}

/**
 * @param {object} o
 * @param {object} o.senaryo
 * @param {string[]} o.acilanlar            oturumda açılan gizli bilgi kimlikleri
 * @param {ReturnType<typeof degerlendirmeyiDuzelt>} o.degerlendirme
 */
export function puanla({ senaryo, acilanlar, degerlendirme, gecmis = [], tahmin = '' }) {
  const n = degerlendirme.sorular.length;
  const acikSayisi = degerlendirme.sorular.filter((s) => s.tur === 'acik').length;
  const yonlendiriciSayisi = degerlendirme.sorular.filter((s) => s.yonlendirici).length;
  const kritikler = senaryo.gizli_bilgiler.filter((b) => b.onem === 'kritik');
  const kritikAcilan = kritikler.filter((b) => acilanlar.includes(b.id)).length;

  const puanlar = {
    acik: { puan: n ? orandanPuana(acikSayisi / n) : 1, yorum: `${n} sorudan ${acikSayisi} tanesi açık uçluydu.` },
    derinlesme: degerlendirme.derinlesme,
    varsayimsiz: {
      puan: n ? orandanPuana((n - yonlendiriciSayisi) / n) : 1,
      yorum: yonlendiriciSayisi ? `${n} sorudan ${yonlendiriciSayisi} tanesi yönlendiriciydi.` : 'Hiçbir soru cevabı içinde taşımıyordu.',
    },
    kesif: { puan: orandanPuana(kritikAcilan / kritikler.length), yorum: `${kritikler.length} kritik bilgiden ${kritikAcilan} tanesi ortaya çıktı.` },
    sonuc: degerlendirme.sonuc,
  };

  // Dayanak: puanın kullanıcının hangi sorusuna (ya da tahminindeki hangi ifadeye) dayandığı. Soru metni oturum
  // kaydından gelir; model yalnız numara seçer. Kod boyutlarında dayanak etiketlerden çıkar.
  const soru = (no, etiket) => ({ no, soru: gecmis[no - 1]?.soru ?? '', etiket });
  const sorular = degerlendirme.sorular;
  const dayanak = {
    acik: (sorular.some((s) => s.tur !== 'acik') ? sorular.filter((s) => s.tur !== 'acik').map((s) => soru(s.no, 'kapalı')) : sorular.slice(0, 2).map((s) => soru(s.no, 'açık uçlu'))).slice(0, 3),
    varsayimsiz: sorular.filter((s) => s.yonlendirici).map((s) => soru(s.no, 'yönlendirici')).slice(0, 3),
    kesif: [],
    derinlesme: (degerlendirme.derinlesme.dayanak || []).map((no) => soru(no, '')),
    sonuc: degerlendirme.sonuc.dayanak && String(tahmin).toLocaleLowerCase('tr').includes(degerlendirme.sonuc.dayanak.toLocaleLowerCase('tr'))
      ? [{ alinti: degerlendirme.sonuc.dayanak }] : tahmin ? [{ alinti: String(tahmin).slice(0, 160) }] : [],
  };
  const boyutlar = BOYUTLAR.map((b) => ({ ...b, puan: puanlar[b.anahtar].puan, yorum: puanlar[b.anahtar].yorum, kaynak: ['derinlesme', 'sonuc'].includes(b.anahtar) ? 'model' : 'kod', dayanak: dayanak[b.anahtar].filter((d) => d.alinti || d.soru) }));
  const toplam = Math.round(boyutlar.reduce((t, b) => t + (b.agirlik * b.puan) / 5, 0));
  return { toplam, boyutlar, kritikAcilan, kritikToplam: kritikler.length };
}
