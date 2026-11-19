// Model katmanı: çekirdeğin geri kalanı yalnızca iki fonksiyon görür.
//   model.karakter({ senaryo, gecmis, soru, acilanlar })   → { cevap, acilan: [kimlik] }
//   model.degerlendir({ senaryo, gecmis, acilanlar, tahmin }) → ham değerlendirme (puanlama.js düzeltir)
// İki uygulama var: Anthropic API (yayın) ve sahte model (testler ve anahtarsız yerel deneme).
import { DEGERLENDIRICI_ARACI, DEGERLENDIRICI_ISTEMI, degerlendirmeMesaji, karakterAraci, karakterIstemi } from './istemler.js';

/**
 * Model çağrısı hatası. `kod` nedeni söyler:
 *   kredi  → Anthropic hesabında kredi bitti (yükleme yapılana kadar düzelmez)
 *   yetki  → API anahtarı geçersiz ya da yetkisiz
 *   gecici → yoğunluk, zaman aşımı, ağ; bir süre sonra kendiliğinden düzelir
 *   istek  → diğer (ör. yanlış model adı, beklenmeyen cevap)
 */
export class ModelHatasi extends Error {
  constructor(mesaj, { kod = 'istek' } = {}) {
    super(mesaj);
    this.kod = kod;
  }
}

/** Başarısız API cevabını sınıflandırır. Kredi hatası sürüme göre 402 ya da 400 + "credit balance" metniyle gelebilir. */
async function hataSinifi(yanit) {
  let tur = '', mesaj = '';
  try {
    const govde = await yanit.json();
    tur = String(govde?.error?.type || '');
    mesaj = String(govde?.error?.message || '');
  } catch { /* gövde yok ya da JSON değil */ }
  if (yanit.status === 402 || tur === 'billing_error' || /credit balance|billing/i.test(mesaj)) return 'kredi';
  if (yanit.status === 401 || yanit.status === 403) return 'yetki';
  return 'istek';
}

const API = 'https://api.anthropic.com/v1/messages';

/**
 * @param {object} o
 * @param {string} o.apiKey
 * @param {string} o.karakterModeli        hızlı ve ucuz model (karakter cevapları)
 * @param {string} o.degerlendiriciModeli  rapor kalitesini belirleyen model
 * @param {typeof fetch} [o.fetch]         testlerde sahte fetch verilir
 * @param {(kayit: object) => void} [o.kullanim]  token kullanımını kaydetmek için
 */
export function anthropicModel({ apiKey, karakterModeli, degerlendiriciModeli, fetch: f = fetch, zamanAsimiMs = 30_000, kullanim = () => {} }) {
  async function cagir({ model, system, messages, arac, maxTokens, tur }) {
    const govde = JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages,
      tools: [arac],
      tool_choice: { type: 'tool', name: arac.name }, // model serbest metin yazamaz, aracı doldurmak zorunda
    });
    let sonHata;
    for (let deneme = 0; deneme < 2; deneme++) {
      try {
        const yanit = await f(API, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: govde,
          signal: AbortSignal.timeout(zamanAsimiMs),
        });
        if (yanit.status === 429 || yanit.status >= 500) {
          sonHata = new ModelHatasi(`Model servisi yoğun (HTTP ${yanit.status}).`, { kod: 'gecici' });
          await new Promise((r) => setTimeout(r, 800));
          continue; // geçici hata: bir kez daha dene
        }
        if (!yanit.ok) {
          const kod = await hataSinifi(yanit);
          throw new ModelHatasi(`Model isteği reddedildi (HTTP ${yanit.status}, ${kod}).`, { kod });
        }
        const veri = await yanit.json();
        kullanim({ tur, model, girdi: veri.usage?.input_tokens || 0, cikti: veri.usage?.output_tokens || 0 });
        const blok = (veri.content || []).find((b) => b.type === 'tool_use' && b.name === arac.name);
        if (!blok || typeof blok.input !== 'object') throw new ModelHatasi('Model beklenen biçimde cevap vermedi.');
        return blok.input;
      } catch (err) {
        if (err instanceof ModelHatasi && err.kod !== 'gecici') throw err;
        sonHata = err instanceof ModelHatasi ? err : new ModelHatasi(`Model servisine ulaşılamadı (${err.name}).`, { kod: 'gecici' });
      }
    }
    throw sonHata;
  }

  return {
    ad: 'anthropic',
    async karakter({ senaryo, gecmis, soru, acilanlar }) {
      const messages = [];
      for (const t of gecmis) {
        messages.push({ role: 'user', content: t.soru }, { role: 'assistant', content: t.cevap });
      }
      messages.push({ role: 'user', content: soru });
      const girdi = await cagir({
        model: karakterModeli, system: karakterIstemi(senaryo, acilanlar), messages,
        arac: karakterAraci(senaryo), maxTokens: 400, tur: 'karakter',
      });
      return { cevap: girdi.cevap, acilan: girdi.acilan_bilgiler };
    },
    degerlendir({ senaryo, gecmis, acilanlar, tahmin }) {
      return cagir({
        model: degerlendiriciModeli, system: DEGERLENDIRICI_ISTEMI,
        messages: [{ role: 'user', content: degerlendirmeMesaji({ senaryo, gecmis, acilanlar, tahmin }) }],
        arac: DEGERLENDIRICI_ARACI, maxTokens: 1800, tur: 'degerlendirme',
      });
    },
  };
}

const kucuk = (s) => String(s).toLocaleLowerCase('tr');

/**
 * Sahte model: API anahtarı olmadan çalışır. Kural tabanlıdır, yapay zekâ değildir.
 * Karakter: soruda bir gizli bilginin "ipucu_kelimeler"i geçiyorsa o bilgiyi söyler.
 * Değerlendirici: soru kalıplarına bakarak etiketler. Testler ve yerel deneme içindir.
 */
export function sahteModel() {
  const ACIK = /(^|\s)(ne|neler|nasıl|neden|niçin|hangi|kim|kimler|nerede|ne zaman)(\s|\?|$)|anlat|bahseder|açıklar/;
  const YONLENDIRICI = /değil mi|öyle değil|isteksiz|tembel|motivasyon|suç|yüzünden mi|fiyat(tan)? mı/;
  return {
    ad: 'sahte',
    async karakter({ senaryo, soru, acilanlar }) {
      const s = kucuk(soru);
      const acik = ACIK.test(s) && !YONLENDIRICI.test(s);
      const aday = senaryo.gizli_bilgiler.find(
        (b) => !acilanlar.includes(b.id) && (b.ipucu_kelimeler || []).some((k) => s.includes(kucuk(k))),
      );
      if (aday && acik) return { cevap: aday.bilgi, acilan: [aday.id] };
      if (aday) return { cevap: 'Olabilir, tam emin değilim.', acilan: [] };
      return { cevap: senaryo.yaniltici_ipuclari[0] || 'Bilmiyorum, belirli bir şey söyleyemem.', acilan: [] };
    },
    async degerlendir({ senaryo, gecmis, tahmin }) {
      const sorular = gecmis.map((t, i) => {
        const s = kucuk(t.soru);
        const yonlendirici = YONLENDIRICI.test(s);
        const acik = ACIK.test(s);
        return {
          no: i + 1,
          tur: acik ? 'acik' : 'kapali',
          yonlendirici,
          not: acik && !yonlendirici ? 'Karşı tarafı konuşturan açık bir soru.' : 'Bu soru kısa bir cevapla geçiştirilebiliyor.',
          daha_iyi: acik && !yonlendirici ? '' : senaryo.ideal_sorular[i % senaryo.ideal_sorular.length],
        };
      });
      const t = kucuk(tahmin || '');
      const isabet = (senaryo.kok_neden_kelimeler || []).filter((k) => t.includes(kucuk(k))).length;
      return {
        sorular,
        derinlesme: {
          puan: gecmis.length > 1 ? 3 : 2, yorum: 'Bazı cevapların peşine düştün, bazıları havada kaldı.',
          // Önceki cevaptan en az bir kelimeyi (5+ harf) kullanan sorular derinleşme dayanağıdır.
          dayanak_sorular: gecmis.map((t, i) => (i && kucuk(gecmis[i - 1].cevap).split(/[^\p{L}]+/u).filter((w) => w.length >= 5).some((w) => kucuk(t.soru).includes(w)) ? i + 1 : 0)).filter(Boolean).slice(0, 3),
        },
        sonuc: {
          dayanak: (senaryo.kok_neden_kelimeler || []).find((k) => t.includes(kucuk(k))) || '',
          puan: isabet >= 2 ? 5 : isabet === 1 ? 3 : 1,
          yorum: isabet >= 2 ? 'Tahminin kök nedenle örtüşüyor.' : isabet === 1 ? 'Ana nedenlerden birini yakaladın.' : 'Tahminin yüzeyde kaldı.',
        },
        ozet: 'Bu rapor yapay zekâsız deneme modunda, basit kurallarla üretildi.',
      };
    },
  };
}
