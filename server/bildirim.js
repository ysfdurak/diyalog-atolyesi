// Site sahibine bildirim: kredi bitti, kredi azaldı, API anahtarı reddedildi, günlük site tavanı doldu.
// BILDIRIM_URL adresine düz metin POST eder. ntfy.sh ile uyumludur (telefona anlık bildirim); düz metin kabul eden
// başka bir webhook da olur. Adres boşsa bildirim yalnızca sunucu kaydına (docker logs) yazılır.
// Aynı olay günde en fazla bir kez gönderilir; gönderim uygulamayı asla bekletmez ve hata fırlatmaz.

/**
 * @param {object} o
 * @param {string} o.url
 * @param {{metaOku: Function, metaYaz: Function}} o.store
 * @param {() => string} o.gun   bugünün tarihi (YYYY-AA-GG)
 */
export function createBildirim({ url, store, gun, log = () => {}, fetch: f = fetch }) {
  return {
    gonder(olay, metin, { acil = false } = {}) {
      const anahtar = 'bildirim:' + olay;
      if (store.metaOku(anahtar) === gun()) return false; // bugün zaten gönderildi
      store.metaYaz(anahtar, gun());
      log(`BİLDİRİM (${olay}): ${metin}`);
      if (url) {
        f(url, {
          method: 'POST',
          headers: { 'content-type': 'text/plain; charset=utf-8', Title: 'Diyalog Atolyesi', Priority: acil ? 'high' : 'default', Tags: acil ? 'warning' : 'information_source' },
          body: metin,
          signal: AbortSignal.timeout(10_000),
        }).then((y) => { if (!y.ok) log(`Bildirim gönderilemedi (HTTP ${y.status}).`); })
          .catch((err) => log(`Bildirim gönderilemedi (${err.name}).`));
      }
      return true;
    },
  };
}
