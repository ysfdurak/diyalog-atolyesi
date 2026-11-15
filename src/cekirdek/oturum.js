// Oturum servisi: uygulamanın çekirdeği. Web kapısı (server/app.js) ve MCP kapısı (server/mcp.js)
// yalnızca bu dosyadaki üç komutu çağırır: baslat → soruSor (en fazla soru hakkı kadar) → degerlendir.
// Kurallar (soru hakkı, uzunluk sınırı, kullanım limiti, puanlama) tek yerde durur; kapılar kural içermez.
//
// Oturumlar bellekte tutulur ve kısa ömürlüdür. Konuşma metni hiçbir yere kaydedilmez;
// oturum bitince yalnızca anonim özet (senaryo, soru sayısı, skor) istatistik için yazılır.
import { randomBytes } from 'node:crypto';
import { degerlendirmeyiDuzelt, puanla } from './puanlama.js';
import { herkeseAcik } from './senaryolar.js';

/** Kullanıcıya olduğu gibi gösterilebilen iş kuralı hatası. */
export class KuralHatasi extends Error {
  constructor(mesaj, { durum = 400, kod = 'kural' } = {}) {
    super(mesaj);
    this.durum = durum;
    this.kod = kod;
  }
}

export const SORU_UZUNLUGU = 300;
export const TAHMIN_UZUNLUGU = 500;
const OTURUM_OMRU_MS = 45 * 60_000;
const AZAMI_ACIK_OTURUM = 500;

const temizle = (v, uzunluk) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, uzunluk + 1) : '');

/**
 * @param {object} o
 * @param {Map<string, object>} o.senaryolar
 * @param {{karakter: Function, degerlendir: Function}} o.model
 * @param {(kanal: string, ziyaretci: string) => {izin: boolean, mesaj?: string}} o.limit   oturum hakkı varsa düşer
 * @param {(ozet: object) => void} [o.kaydet]   biten oturumun anonim özeti
 * @param {() => number} [o.simdi]
 */
export function oturumServisi({ senaryolar, model, limit, kaydet = () => {}, simdi = Date.now, log = () => {} }) {
  /** @type {Map<string, any>} */
  const oturumlar = new Map();

  function supur() {
    const esik = simdi() - OTURUM_OMRU_MS;
    for (const [id, o] of oturumlar) if (o.sonIslem < esik) oturumlar.delete(id);
  }

  function bul(id) {
    const o = oturumlar.get(String(id || ''));
    if (!o || o.sonIslem < simdi() - OTURUM_OMRU_MS) {
      throw new KuralHatasi('Oturum bulunamadı ya da süresi doldu. Yeni bir oturum başlat.', { durum: 404, kod: 'oturum-yok' });
    }
    return o;
  }

  /** Aynı oturumda iki istek aynı anda işlenmez (çift tıklama, yinelenen istek). */
  async function kilitle(o, is) {
    if (o.mesgul) throw new KuralHatasi('Önceki istek hâlâ işleniyor.', { durum: 409, kod: 'mesgul' });
    o.mesgul = true;
    try {
      return await is();
    } finally {
      o.mesgul = false;
      o.sonIslem = simdi();
    }
  }

  return {
    senaryoListesi: () => [...senaryolar.values()].map(herkeseAcik),

    /** Yeni oturum. Kullanım limiti burada düşer: bir oturum en fazla (soru hakkı + 1) model çağrısı yapar. */
    baslat({ senaryoId, kanal = 'web', ziyaretci = '' }) {
      const senaryo = senaryolar.get(String(senaryoId || ''));
      if (!senaryo) throw new KuralHatasi('Böyle bir senaryo yok.', { durum: 404, kod: 'senaryo-yok' });
      supur();
      if (oturumlar.size >= AZAMI_ACIK_OTURUM) {
        throw new KuralHatasi('Şu an çok fazla açık oturum var. Birkaç dakika sonra tekrar dene.', { durum: 503, kod: 'yogun' });
      }
      const hak = limit(kanal, ziyaretci);
      if (!hak.izin) throw new KuralHatasi(hak.mesaj, { durum: 429, kod: 'limit' });
      const o = {
        id: randomBytes(18).toString('base64url'),
        senaryo, kanal, gecmis: [], acilanlar: [], durum: 'soru', rapor: null, mesgul: false,
        baslangic: simdi(), sonIslem: simdi(),
      };
      oturumlar.set(o.id, o);
      return { oturumId: o.id, senaryo: herkeseAcik(senaryo), kalanSoru: senaryo.soru_hakki };
    },

    /** Karaktere bir soru sorar. Cevap ve kalan soru hakkı döner; hangi bilgilerin açıldığı oyun sırasında söylenmez. */
    soruSor({ oturumId, soru }) {
      const o = bul(oturumId);
      return kilitle(o, async () => {
        if (o.durum !== 'soru') throw new KuralHatasi('Bu oturumda soru aşaması bitti.', { kod: 'asama' });
        const metin = temizle(soru, SORU_UZUNLUGU);
        if (!metin) throw new KuralHatasi('Soru boş olamaz.');
        if (metin.length > SORU_UZUNLUGU) throw new KuralHatasi(`Soru en fazla ${SORU_UZUNLUGU} karakter olabilir.`);
        if (o.gecmis.length >= o.senaryo.soru_hakki) throw new KuralHatasi('Soru hakkın bitti. Kök neden tahminini yaz.', { kod: 'hak-bitti' });

        const yanit = await model.karakter({ senaryo: o.senaryo, gecmis: o.gecmis, soru: metin, acilanlar: o.acilanlar });
        const cevap = temizle(yanit?.cevap, 800) || '…';
        // Model yalnızca senaryoda tanımlı kimlikleri açabilir; tanımadığı kimlik yok sayılır.
        const gecerli = new Set(o.senaryo.gizli_bilgiler.map((b) => b.id));
        for (const id of Array.isArray(yanit?.acilan) ? yanit.acilan : []) {
          if (gecerli.has(id) && !o.acilanlar.includes(id)) o.acilanlar.push(id);
        }
        o.gecmis.push({ soru: metin, cevap });
        const kalanSoru = o.senaryo.soru_hakki - o.gecmis.length;
        return { cevap, kalanSoru, soruNo: o.gecmis.length };
      });
    },

    /** Oturumu bitirir: kök neden tahminini alır, değerlendirir ve raporu döner. Aynı oturum için rapor bir kez üretilir. */
    degerlendir({ oturumId, tahmin }) {
      const o = bul(oturumId);
      return kilitle(o, async () => {
        if (o.rapor) return o.rapor;
        if (!o.gecmis.length) throw new KuralHatasi('Değerlendirme için en az bir soru sormalısın.');
        const metin = temizle(tahmin, TAHMIN_UZUNLUGU);
        if (metin.length > TAHMIN_UZUNLUGU) throw new KuralHatasi(`Tahmin en fazla ${TAHMIN_UZUNLUGU} karakter olabilir.`);

        const ham = await model.degerlendir({ senaryo: o.senaryo, gecmis: o.gecmis, acilanlar: o.acilanlar, tahmin: metin });
        const degerlendirme = degerlendirmeyiDuzelt(ham, o.gecmis.length);
        const skor = puanla({ senaryo: o.senaryo, acilanlar: o.acilanlar, degerlendirme });
        const bilgi = (b) => ({ bilgi: b.bilgi, onem: b.onem });
        o.rapor = {
          senaryo: { id: o.senaryo.id, baslik: o.senaryo.baslik, karakterAdi: o.senaryo.karakter.ad },
          toplam: skor.toplam,
          boyutlar: skor.boyutlar,
          ozet: degerlendirme.ozet,
          sorular: o.gecmis.map((t, i) => ({ ...degerlendirme.sorular[i], soru: t.soru, cevap: t.cevap })),
          tahmin: metin,
          kokNeden: o.senaryo.kok_neden,
          acilanlar: o.senaryo.gizli_bilgiler.filter((b) => o.acilanlar.includes(b.id)).map(bilgi),
          kacirilanlar: o.senaryo.gizli_bilgiler.filter((b) => !o.acilanlar.includes(b.id)).map(bilgi),
          idealSorular: o.senaryo.ideal_sorular,
        };
        o.durum = 'bitti';
        try {
          kaydet({ senaryo: o.senaryo.id, kanal: o.kanal, soruSayisi: o.gecmis.length, toplam: skor.toplam, kritikAcilan: skor.kritikAcilan, sureSn: Math.round((simdi() - o.baslangic) / 1000) });
        } catch (err) {
          log(`Oturum özeti kaydedilemedi: ${err.message}`);
        }
        return o.rapor;
      });
    },

    supur,
    acikOturumSayisi: () => oturumlar.size,
  };
}
