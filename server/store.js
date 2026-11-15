// SQLite deposu (Node'un yerleşik node:sqlite modülü; ek paket gerekmez).
// Burada yalnızca sayaçlar ve anonim özetler durur. Konuşma metni, soru ya da tahmin KAYDEDİLMEZ.
//   sayac    : günlük kullanım limitleri (ziyaretçi başına, site geneli, MCP)
//   oturum   : biten oturumların anonim özeti (senaryo, soru sayısı, skor)
//   kullanim : günlük model kullanımı (token), maliyeti izlemek için
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';

export function openStore(dosya) {
  const db = new DatabaseSync(dosya);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS meta (anahtar TEXT PRIMARY KEY, deger TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sayac (gun TEXT NOT NULL, anahtar TEXT NOT NULL, sayi INTEGER NOT NULL, PRIMARY KEY (gun, anahtar));
    CREATE TABLE IF NOT EXISTS oturum (
      id INTEGER PRIMARY KEY AUTOINCREMENT, zaman INTEGER NOT NULL, gun TEXT NOT NULL, senaryo TEXT NOT NULL, kanal TEXT NOT NULL,
      soru_sayisi INTEGER NOT NULL, toplam INTEGER NOT NULL, kritik_acilan INTEGER NOT NULL, sure_sn INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS kullanim (
      gun TEXT NOT NULL, tur TEXT NOT NULL, model TEXT NOT NULL, cagri INTEGER NOT NULL, girdi INTEGER NOT NULL, cikti INTEGER NOT NULL,
      PRIMARY KEY (gun, tur, model));
  `);

  const oku = db.prepare('SELECT sayi FROM sayac WHERE gun = ? AND anahtar = ?');
  const artir = db.prepare('INSERT INTO sayac (gun, anahtar, sayi) VALUES (?, ?, 1) ON CONFLICT(gun, anahtar) DO UPDATE SET sayi = sayi + 1');
  const sayi = (gun, anahtar) => oku.get(gun, anahtar)?.sayi || 0;

  return {
    /** Ziyaretçi kimliği özetlenirken kullanılan gizli tuz. İlk açılışta üretilir, veritabanında kalır. */
    tuz() {
      const satir = db.prepare("SELECT deger FROM meta WHERE anahtar = 'tuz'").get();
      if (satir) return satir.deger;
      const deger = randomBytes(24).toString('base64url');
      db.prepare("INSERT INTO meta (anahtar, deger) VALUES ('tuz', ?)").run(deger);
      return deger;
    },

    sayi,

    /**
     * Verilen sayaçların hepsinde yer varsa hepsini bir artırır; biri doluysa hiçbirini artırmaz.
     * @param {string} gun
     * @param {{anahtar: string, sinir: number, mesaj: string}[]} sayaclar
     */
    hakDus(gun, sayaclar) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const dolu = sayaclar.find((s) => sayi(gun, s.anahtar) >= s.sinir);
        if (dolu) {
          db.exec('ROLLBACK');
          return { izin: false, mesaj: dolu.mesaj };
        }
        for (const s of sayaclar) artir.run(gun, s.anahtar);
        db.exec('COMMIT');
        return { izin: true };
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    oturumKaydet(gun, o) {
      db.prepare('INSERT INTO oturum (zaman, gun, senaryo, kanal, soru_sayisi, toplam, kritik_acilan, sure_sn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(Date.now(), gun, o.senaryo, o.kanal, o.soruSayisi, o.toplam, o.kritikAcilan, o.sureSn);
    },

    kullanimKaydet(gun, k) {
      db.prepare(`INSERT INTO kullanim (gun, tur, model, cagri, girdi, cikti) VALUES (?, ?, ?, 1, ?, ?)
        ON CONFLICT(gun, tur, model) DO UPDATE SET cagri = cagri + 1, girdi = girdi + excluded.girdi, cikti = cikti + excluded.cikti`)
        .run(gun, k.tur, k.model, k.girdi, k.cikti);
    },

    /** Son `gunSayisi` günün özeti: başlatılan ve biten oturumlar, senaryo bazında ortalama skor, model kullanımı. */
    istatistik(esikGun) {
      return {
        baslatilan: db.prepare("SELECT gun, anahtar, sayi FROM sayac WHERE gun >= ? AND anahtar IN ('site', 'mcp') ORDER BY gun DESC").all(esikGun),
        biten: db.prepare(`SELECT senaryo, kanal, COUNT(*) AS adet, ROUND(AVG(toplam)) AS ortalama_skor, ROUND(AVG(soru_sayisi), 1) AS ortalama_soru,
          ROUND(AVG(sure_sn)) AS ortalama_sure_sn FROM oturum WHERE gun >= ? GROUP BY senaryo, kanal ORDER BY adet DESC`).all(esikGun),
        kullanim: db.prepare('SELECT tur, model, SUM(cagri) AS cagri, SUM(girdi) AS girdi, SUM(cikti) AS cikti FROM kullanim WHERE gun >= ? GROUP BY tur, model').all(esikGun),
      };
    },

    /** Eski günlük sayaçları siler (ziyaretçi özetleri 2 günden uzun tutulmaz). */
    temizle(esikGun) {
      db.prepare("DELETE FROM sayac WHERE gun < ? AND anahtar LIKE 'z:%'").run(esikGun);
    },

    close: () => db.close(),
  };
}
