// Diyalog Atölyesi arayüzü (derleme adımı yok, tek dosya).
// Üç ekran: ana sayfa → oturum (soru + tahmin) → rapor. Kural içermez; her şey /api üzerinden çekirdekten gelir.
// Güvenlik: kullanıcıdan ve modelden gelen her metin textContent ile yazılır, innerHTML kullanılmaz.

const kok = document.getElementById('uygulama');
const SVG = 'http://www.w3.org/2000/svg';
const DEPO = 'diyalog.v1';

/** Küçük DOM yardımcısı: el('p', { class: 'x' }, 'metin', altEleman) */
function el(etiket, ozellikler = {}, ...cocuklar) {
  const e = etiket === 'svg' || ozellikler.svg ? document.createElementNS(SVG, etiket) : document.createElement(etiket);
  for (const [k, v] of Object.entries(ozellikler)) {
    if (k === 'svg' || v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of cocuklar.flat()) if (c != null && c !== false) e.append(c);
  return e;
}

const durum = { sunucu: null, oturum: null, rapor: null, ornek: null };

// --- Tarayıcıdaki gelişim kaydı -------------------------------------------------
// localStorage bazı bağlamlarda (gizli sekme, kısıtlı tarayıcı) hata verebilir; o durumda gelişim yalnızca bu oturumda tutulur.
let bellek = { gecmis: [] };
function gecmisiOku() {
  try {
    const v = JSON.parse(localStorage.getItem(DEPO) || 'null');
    if (v && Array.isArray(v.gecmis)) bellek = v;
  } catch { /* yok say */ }
  return bellek.gecmis;
}
// Varyantı olmayan eski kayıtlar ilk varyanta (v1) aittir.
const kayitVaryanti = (g) => g.varyant || 'v1';
/** Bu tarayıcıda bir senaryonun oynanmış varyantları */
const oynananVaryantlar = (senaryoId) => [...new Set(gecmisiOku().filter((g) => g.senaryoId === senaryoId).map(kayitVaryanti))];

function gecmiseEkle(rapor) {
  const gecmis = gecmisiOku();
  const varyant = rapor.senaryo.varyant || 'v1';
  gecmis.push({
    t: Date.now(), senaryoId: rapor.senaryo.id, varyant, toplam: rapor.toplam,
    boyutlar: Object.fromEntries(rapor.boyutlar.map((b) => [b.anahtar, b.puan])),
    // Gelişim grafiği her varyantın yalnızca ilk denemesini sayar: aynı kök nedeni ikinci kez bulmak beceri değil, hatırlamadır.
    ilk: !gecmis.some((g) => g.senaryoId === rapor.senaryo.id && kayitVaryanti(g) === varyant),
  });
  bellek.gecmis = gecmis.slice(-200);
  try {
    localStorage.setItem(DEPO, JSON.stringify(bellek));
  } catch { /* yok say */ }
}

// --- Sunucu ------------------------------------------------------------------------
async function istek(yol, govde) {
  let yanit;
  try {
    yanit = await fetch(yol, govde ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(govde) } : undefined);
  } catch {
    throw new Error('Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.');
  }
  const veri = await yanit.json().catch(() => ({}));
  if (!yanit.ok) throw Object.assign(new Error(veri.hata || 'İstek işlenemedi.'), { kod: veri.kod, durum: yanit.status });
  return veri;
}

function goster(...icerik) {
  kok.replaceChildren(...icerik.flat().filter(Boolean));
  window.scrollTo(0, 0);
  kok.querySelector('h1')?.focus?.();
}

const zorlukGoster = (z) => el('span', { class: 'zorluk', role: 'img', 'aria-label': `Zorluk ${z} / 3` }, 'Zorluk', [1, 2, 3].map((i) => el('i', { class: i <= z ? 'dolu' : '' })));
const hataKutusu = (mesaj) => el('p', { class: 'kutu hata', role: 'alert' }, mesaj);

// --- Ana sayfa ---------------------------------------------------------------------
async function anaSayfa() {
  durum.oturum = null;
  if (location.hash) history.replaceState(null, '', location.pathname);
  try {
    durum.sunucu = await istek('/api/durum');
  } catch (err) {
    return goster(el('h1', { tabindex: '-1' }, 'Diyalog Atölyesi'), hataKutusu(err.message), el('p', { class: 'uyari' }, el('button', { class: 'dugme', onclick: anaSayfa }, 'Tekrar dene')));
  }
  const s = durum.sunucu;
  const gecmis = gecmisiOku();
  const gunun = s.senaryolar.find((x) => x.id === s.gununSenaryosu) || s.senaryolar[0];
  const oynanabilir = s.kalanOturum > 0 && s.siteAcik && !s.kapaliMesaji;
  const hakMetni = s.kapaliMesaji
    ? ''
    : !s.siteAcik
    ? 'Bugün için site genelindeki oturum hakkı doldu. Yarın tekrar açılır; bu arada örnek oturumu inceleyebilirsin.'
    : s.kalanOturum > 0
      ? `Bugün ${s.gunlukHak} oturum hakkından ${s.kalanOturum} tanesi duruyor.`
      : `Bugünkü ${s.gunlukHak} oturum hakkını kullandın. Yarın devam edebilirsin.`;

  const kart = (sn) => {
    const enIyi = Math.max(0, ...gecmis.filter((g) => g.senaryoId === sn.id).map((g) => g.toplam));
    const n = sn.varyantlar.length;
    const oynanan = oynananVaryantlar(sn.id).filter((v) => sn.varyantlar.includes(v)).length;
    return el('article', { class: 'kart' + (sn.id === gunun.id ? ' gunun' : '') },
      el('div', { class: 'kart-ust' },
        sn.id === gunun.id && el('span', { class: 'etiket vurgu' }, 'Günün senaryosu'),
        el('span', { class: 'etiket' }, sn.alan),
        zorlukGoster(sn.zorluk)),
      el('h3', {}, sn.baslik),
      el('p', {}, sn.acilis),
      el('div', { class: 'kart-alt' },
        el('span', { class: 'kucuk soluk' }, `${sn.karakter.ad} · ${sn.karakter.rol}${n > 1 ? ` · ${n} farklı kök neden${oynanan ? `, ${oynanan} tanesini oynadın` : ''}` : ''}${enIyi ? ` · En iyi skorun ${enIyi}` : ''}`),
        el('button', { class: 'dugme' + (sn.id === gunun.id ? ' ana' : ''), disabled: !oynanabilir, onclick: (e) => oturumBaslat(sn.id, e.currentTarget) }, 'Başla')));
  };

  goster(
    el('section', { class: 'kahraman' },
      el('p', { class: 'ustbaslik' }, 'Doğru soru sorma pratiği'),
      el('h1', { tabindex: '-1' }, 'Cevabı değil, soruyu çalış.'),
      el('p', { class: 'giris' }, 'Bir senaryo seç. Karşındaki kişi bildiğini ancak doğru soruya anlatır. 5 soru hakkın var; sonunda kök nedeni tahmin et, soruların tek tek değerlendirilsin.'),
      el('div', { class: 'dugmeler' },
        el('button', { class: 'dugme ana', disabled: !oynanabilir, onclick: (e) => oturumBaslat(gunun.id, e.currentTarget) }, 'Günün senaryosunu oyna'),
        el('button', { class: 'dugme', onclick: () => ornekGoster() }, 'Örnek oturumu izle')),
      s.kapaliMesaji ? el('p', { class: 'kutu bilgi uyari', role: 'status' }, s.kapaliMesaji) : el('p', { class: 'hak' }, hakMetni),
      !s.yapayZeka && el('p', { class: 'kutu bilgi uyari' }, 'Deneme modu: yapay zekâ kapalı, karakter basit kurallarla cevap veriyor.')),

    el('section', { class: 'bolum', 'aria-labelledby': 'b-senaryolar' },
      el('h2', { id: 'b-senaryolar' }, 'Senaryolar'),
      s.senaryolar.some((x) => x.varyantlar.length > 1) && el('p', { class: 'soluk kucuk' }, 'Bazı senaryoların birden fazla kök nedeni var. Tekrar oynadığında oynamadığın bir kök neden gelir; önceki raporu hatırlamak değil, doğru soruyu sormak işe yarar.'),
      el('div', { class: 'kartlar senaryo-kartlari' }, [gunun, ...s.senaryolar.filter((x) => x.id !== gunun.id)].map(kart))),

    el('section', { class: 'bolum', 'aria-labelledby': 'b-nasil' },
      el('h2', { id: 'b-nasil' }, 'Nasıl çalışır'),
      el('ol', { class: 'adimlar' },
        el('li', {}, el('div', {}, el('strong', {}, 'Durumu oku, sorularını sor'), el('span', {}, 'Karakter yalnızca sorduğunu cevaplar. Evet/hayır sorusu kısa cevap alır; suçlayan soru savunma alır.'))),
        el('li', {}, el('div', {}, el('strong', {}, 'Kök nedeni tahmin et'), el('span', {}, 'Soru hakkın bitince ya da hazır olduğunda tek cümleyle sence asıl nedeni yaz.'))),
        el('li', {}, el('div', {}, el('strong', {}, 'Raporunu incele'), el('span', {}, '100 üzerinden skor, hangi bilgileri kaçırdığın ve her soru için "şöyle sorabilirdin" önerisi.'))))),

    gelisimBolumu(gecmis, s.senaryolar),

    el('section', { class: 'bolum', 'aria-labelledby': 'b-rubrik' },
      el('h2', { id: 'b-rubrik' }, 'Nasıl puanlanır'),
      el('ul', { class: 'boyutlar' }, RUBRIK.map((b) => el('li', { class: 'boyut' },
        el('div', { class: 'boyut-ust' }, b.ad, el('small', {}, `%${b.agirlik}`)),
        el('p', {}, b.aciklama)))),
      el('p', { class: 'kucuk soluk uyari' }, 'Her senaryo aynı rubrikle puanlanır. Bilgi keşfi oturum kaydından, açık uçluluk ve varsayımsızlık soru etiketlerinden hesaplanır; derinleşme ve sonucu yapay zekâ yazılı ölçütlere göre puanlar.')),
  );
}

const RUBRIK = [
  { ad: 'Açık uçlu soru', agirlik: 20, aciklama: 'Soruların "ne, nasıl, neler" ile mi açılıyor, yoksa evet/hayır mı?' },
  { ad: 'Derinleşme', agirlik: 20, aciklama: 'Aldığın cevabı bir sonraki soruda kullanıyor musun?' },
  { ad: 'Varsayımsız soru', agirlik: 15, aciklama: 'Sorun, cevabı ya da suçlamayı içinde taşımıyor mu?' },
  { ad: 'Bilgi keşfi', agirlik: 25, aciklama: 'Kritik bilgilerin kaçını ortaya çıkardın?' },
  { ad: 'Sonuç', agirlik: 20, aciklama: 'Kök neden tahminin doğru ve gerekçeli mi?' },
];
const BOYUT_ADLARI = { acik: 'Açık uçlu soru', derinlesme: 'Derinleşme', varsayimsiz: 'Varsayımsız soru', kesif: 'Bilgi keşfi', sonuc: 'Sonuç' };

function gelisimBolumu(gecmis, senaryolar) {
  const ilkler = gecmis.filter((g) => g.ilk).slice(-10);
  const baslik = el('h2', { id: 'b-gelisim' }, 'Gelişimin');
  if (!ilkler.length) {
    return el('section', { class: 'bolum', 'aria-labelledby': 'b-gelisim' }, baslik,
      el('p', { class: 'soluk' }, 'İlk oturumundan sonra skorların ve boyut ortalamaların burada görünür. Kayıt yalnızca bu tarayıcıda durur.'));
  }
  // Sütun grafik: her senaryonun ilk denemesi, eskiden yeniye
  const G = 600, Y = 190, sol = 30, alt = 34, ust = 18;
  const alan = G - sol - 8;
  const adim = alan / ilkler.length;
  const en = Math.min(46, adim * 0.6);
  const y = (v) => ust + (Y - ust - alt) * (1 - v / 100);
  const ad = (id) => (senaryolar.find((s) => s.id === id)?.alan || id);
  const grafik = el('svg', { class: 'grafik', viewBox: `0 0 ${G} ${Y}`, role: 'img', 'aria-label': 'İlk denemelerdeki skorlar: ' + ilkler.map((g) => `${ad(g.senaryoId)} ${g.toplam}`).join(', ') },
    [0, 50, 100].map((v) => [
      el('line', { svg: true, class: 'eksen', x1: sol, x2: G - 8, y1: y(v), y2: y(v) }),
      el('text', { svg: true, x: sol - 6, y: y(v) + 4, 'text-anchor': 'end' }, String(v)),
    ]),
    ilkler.map((g, i) => {
      const x = sol + adim * i + (adim - en) / 2;
      return [
        el('rect', { svg: true, class: 'sutun', x, y: y(g.toplam), width: en, height: Math.max(1, y(0) - y(g.toplam)), rx: 4 }),
        el('text', { svg: true, class: 'deger', x: x + en / 2, y: y(g.toplam) - 5, 'text-anchor': 'middle' }, String(g.toplam)),
        el('text', { svg: true, x: x + en / 2, y: Y - 14, 'text-anchor': 'middle' }, ad(g.senaryoId).slice(0, 14)),
      ];
    }));
  const ortalama = (anahtar) => gecmis.reduce((t, g) => t + (g.boyutlar?.[anahtar] || 0), 0) / gecmis.length;
  const zayif = Object.keys(BOYUT_ADLARI).sort((a, b) => ortalama(a) - ortalama(b))[0];
  return el('section', { class: 'bolum', 'aria-labelledby': 'b-gelisim' }, baslik,
    el('p', { class: 'soluk kucuk' }, 'Grafikte her senaryonun yalnızca ilk denemesi yer alır; tekrar oynanan senaryo skoru şişirmez.'),
    grafik,
    el('ul', { class: 'boyutlar' }, Object.entries(BOYUT_ADLARI).map(([anahtar, adi]) => {
      const o = ortalama(anahtar);
      const cubuk = el('i');
      cubuk.style.width = `${(o / 5) * 100}%`;
      return el('li', { class: 'boyut' },
        el('div', { class: 'boyut-ust' }, adi, el('small', {}, `${o.toFixed(1)} / 5`)),
        el('div', { class: 'cubuk' }, cubuk));
    })),
    el('p', { class: 'kucuk uyari' }, el('strong', {}, 'Bir sonraki oturumda: '), `${BOYUT_ADLARI[zayif]} boyutuna odaklan (${gecmis.length} oturumun ortalaması ${ortalama(zayif).toFixed(1)}).`));
}

// --- Oturum ------------------------------------------------------------------------
async function oturumBaslat(senaryoId, dugme) {
  if (dugme) dugme.disabled = true;
  try {
    const y = await istek('/api/oturum', { senaryoId, oynananVaryantlar: oynananVaryantlar(senaryoId) });
    durum.oturum = { id: y.oturumId, senaryo: y.senaryo, kalan: y.kalanSoru, mesajlar: [], asama: 'soru' };
    history.pushState(null, '', '#oturum');
    oturumEkrani();
  } catch (err) {
    if (dugme) dugme.disabled = false;
    kok.querySelector('.kutu.hata')?.remove();
    kok.querySelector('.kahraman')?.append(hataKutusu(err.message));
    kok.querySelector('.kutu.hata')?.scrollIntoView({ block: 'center' });
  }
}

function oturumEkrani() {
  const o = durum.oturum;
  const sn = o.senaryo;
  const sohbet = el('ol', { class: 'sohbet', 'aria-live': 'polite' });
  const mesajEkle = (kim, metin, ek = '') => {
    const li = el('li', { class: `mesaj ${kim}${ek}` }, el('small', {}, kim === 'ben' ? 'Sen' : sn.karakter.ad), metin);
    sohbet.append(li);
    li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return li;
  };
  mesajEkle('karakter', sn.karakter.ilkSoz);
  for (const m of o.mesajlar) mesajEkle(m.kim, m.metin);

  const haklar = el('span', { class: 'haklar', 'aria-hidden': 'true' });
  const sayacMetni = el('span');
  const sayac = el('p', { class: 'sayac' }, sayacMetni, haklar);
  const formAlani = el('div');
  const sayaciCiz = () => {
    const sorulan = sn.soruHakki - o.kalan;
    sayacMetni.textContent = o.asama === 'soru' ? `Soru ${Math.min(sorulan + 1, sn.soruHakki)} / ${sn.soruHakki}` : `${sorulan} soru sordun`;
    haklar.replaceChildren(...Array.from({ length: sn.soruHakki }, (_, i) => el('i', { class: i < sorulan ? 'kullanildi' : '' })));
  };

  function metinAlani({ id, etiket, sinir, yer, gonderMetni, gonder, ikincil }) {
    const alan = el('textarea', { id, maxlength: sinir, placeholder: yer, rows: 3, enterkeyhint: 'send' });
    const sayi = el('span', { class: 'karakter-sayisi' }, `0 / ${sinir}`);
    const hata = el('div');
    const dugme = el('button', { class: 'dugme ana', type: 'submit' }, gonderMetni);
    alan.addEventListener('input', () => { sayi.textContent = `${alan.value.length} / ${sinir}`; });
    alan.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer: fine)').matches) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    const form = el('form', { class: 'form', onsubmit: async (e) => {
      e.preventDefault();
      if (dugme.disabled) return;
      hata.replaceChildren();
      dugme.disabled = true;
      try {
        await gonder(alan.value.trim());
      } catch (err) {
        hata.replaceChildren(hataKutusu(err.message));
        if (err.kod === 'oturum-yok' || err.kod === 'kapali') hata.append(el('p', { class: 'uyari' }, el('button', { class: 'dugme', type: 'button', onclick: anaSayfa }, 'Ana sayfaya dön')));
      } finally {
        dugme.disabled = false;
      }
    } },
    el('label', { for: id }, etiket), alan, hata,
    el('div', { class: 'form-alt' }, sayi, el('div', { class: 'dugmeler' }, ikincil, dugme)));
    return { form, alan };
  }

  function soruFormu() {
    const { form, alan } = metinAlani({
      id: 'soru', etiket: `${sn.karakter.ad} için sorun`, sinir: durum.sunucu.sinirlar.soru, yer: 'Sorunu yaz…', gonderMetni: 'Sor',
      ikincil: o.mesajlar.length ? el('button', { class: 'dugme', type: 'button', onclick: tahmineGec }, 'Sorularım bitti') : null,
      gonder: async (metin) => {
        if (!metin) throw new Error('Önce bir soru yaz.');
        const benim = mesajEkle('ben', metin);
        const yaziyor = mesajEkle('karakter', 'yazıyor…', ' yaziyor');
        try {
          const y = await istek('/api/oturum/soru', { oturumId: o.id, soru: metin });
          yaziyor.remove();
          mesajEkle('karakter', y.cevap);
          o.mesajlar.push({ kim: 'ben', metin }, { kim: 'karakter', metin: y.cevap });
          o.kalan = y.kalanSoru;
          if (o.kalan <= 0) return tahmineGec();
          sayaciCiz();
          soruFormu();
        } catch (err) {
          yaziyor.remove();
          benim.remove();
          throw err;
        }
      },
    });
    formAlani.replaceChildren(form);
    // İlk soruda sorunun nereye gittiği yazılır (kurum içi eğitimde kişisel ya da şirket verisi yazılmasın).
    if (!o.mesajlar.length) form.append(el('p', { class: 'soluk kucuk veri-notu', id: 'veri-notu' }, durum.sunucu.yapayZeka
      ? 'Yazdıkların (sorular ve sondaki tahminin), karakterin cevabı ve değerlendirme için Anthropic’in yapay zekâ servisine (Claude) gönderilir. Gerçek kişi, müşteri ya da şirket bilgisi yazma. Konuşma kaydedilmez; oturum 45 dakika işlem olmazsa silinir. '
      : 'Deneme modu: yapay zekâ kapalı, sorun bu sunucudan dışarı gönderilmez. Konuşma kaydedilmez. ',
    el('a', { href: '/gizlilik.html' }, 'Gizlilik ve veri')));
    if (!o.mesajlar.length) alan.setAttribute('aria-describedby', 'veri-notu');
    alan.focus({ preventScroll: true });
  }

  function tahmineGec() {
    o.asama = 'tahmin';
    sayaciCiz();
    const { form, alan } = metinAlani({
      id: 'tahmin', etiket: 'Sence kök neden ne?', sinir: durum.sunucu.sinirlar.tahmin, yer: 'Tek cümleyle: asıl sorun sence nereden kaynaklanıyor?', gonderMetni: 'Değerlendir',
      gonder: async (metin) => {
        const bekle = el('p', { class: 'soluk kucuk', role: 'status' }, 'Soruların değerlendiriliyor, birkaç saniye sürebilir…');
        form.append(bekle);
        try {
          const rapor = await istek('/api/oturum/degerlendir', { oturumId: o.id, tahmin: metin });
          gecmiseEkle(rapor);
          durum.rapor = rapor;
          durum.oturum = null;
          history.replaceState(null, '', '#rapor');
          raporEkrani(rapor);
        } finally {
          bekle.remove();
        }
      },
    });
    formAlani.replaceChildren(form);
    if (o.kalan <= 0) form.before(el('p', { class: 'kutu bilgi uyari' }, 'Soru hakkın bitti. Şimdi öğrendiklerini birleştir.'));
    alan.focus({ preventScroll: true });
  }

  goster(
    el('a', { class: 'geri', href: '#', onclick: (e) => { e.preventDefault(); if (!o.mesajlar.length || confirm('Oturumdan çıkarsan bu oturum hakkın geri gelmez. Çıkılsın mı?')) anaSayfa(); } }, '← Senaryolar'),
    el('h1', { tabindex: '-1' }, sn.baslik),
    el('dl', { class: 'brifing' },
      el('dt', {}, 'Durum'), el('dd', {}, sn.acilis),
      el('dt', {}, 'Senin rolün'), el('dd', {}, sn.rolun),
      el('dt', {}, 'Karşındaki'), el('dd', {}, `${sn.karakter.ad}, ${sn.karakter.rol}`)),
    sayac, sohbet, formAlani);
  sayaciCiz();
  if (o.asama === 'soru' && o.kalan > 0) soruFormu(); else tahmineGec();
}

// --- Rapor -------------------------------------------------------------------------
function skorHalkasi(toplam) {
  const r = 44, cevre = 2 * Math.PI * r;
  return el('svg', { class: 'skor-halka', viewBox: '0 0 104 104', role: 'img', 'aria-label': `Skor: 100 üzerinden ${toplam}` },
    el('circle', { svg: true, class: 'iz', cx: 52, cy: 52, r }),
    el('circle', { svg: true, class: 'dolgu', cx: 52, cy: 52, r, 'stroke-dasharray': cevre.toFixed(1), 'stroke-dashoffset': (cevre * (1 - toplam / 100)).toFixed(1) }),
    el('text', { svg: true, x: 52, y: 52 }, String(toplam)));
}

/** "Neden bu puan?": puanın kullanıcının hangi sorusuna ya da tahminindeki hangi ifadeye dayandığı.
 *  Soru metinleri oturum kaydından gelir; model yalnız numara seçer. Puana katılmayan kullanıcı somut dayanağı görür. */
function dayanakKutusu(b) {
  const d = b.dayanak || [];
  const kaynak = b.kaynak === 'model' ? 'Bu boyutu yapay zekâ değerlendiricisi puanlar.' : 'Bu puan soruların etiketlerinden kodla hesaplanır.';
  if (!d.length) return el('details', { class: 'dayanak' }, el('summary', {}, 'Neden bu puan?'), el('p', { class: 'kucuk soluk' }, kaynak + (b.anahtar === 'kesif' ? ' Hangi bilgilerin açıldığı aşağıdaki "Ortaya çıkardığın bilgiler" bölümünde.' : '')));
  return el('details', { class: 'dayanak' }, el('summary', {}, 'Neden bu puan? Senin sorundan dayanak'),
    el('ul', { class: 'liste duz' }, d.map((x) => el('li', {}, x.alinti
      ? el('span', {}, 'Tahmininden: ', el('q', {}, x.alinti))
      : el('span', {}, el('b', {}, `Soru ${x.no}`), x.etiket ? ` (${x.etiket})` : '', ': ', el('q', {}, x.soru))))),
    el('p', { class: 'kucuk soluk' }, kaynak + ' Katılmıyorsan aşağıda "Soru soru" bölümündeki notlara bak; aynı soruyu yeniden deneyebilirsin.'));
}

function raporEkrani(rapor, { ornek = false } = {}) {
  const varyant = rapor.senaryo.varyant || 'v1';
  const varyantSayisi = rapor.senaryo.varyantSayisi || 1;
  const tekrar = !ornek && gecmisiOku().filter((g) => g.senaryoId === rapor.senaryo.id && kayitVaryanti(g) === varyant).length > 1;
  const kalanVaryant = varyantSayisi - (ornek ? 0 : oynananVaryantlar(rapor.senaryo.id).length);
  const seviye = rapor.toplam >= 80 ? 'Güçlü bir oturum' : rapor.toplam >= 60 ? 'İyi yoldasın' : rapor.toplam >= 40 ? 'Gelişme alanı var' : 'Yeniden denemeye değer';
  goster(
    el('a', { class: 'geri', href: '#', onclick: (e) => { e.preventDefault(); anaSayfa(); } }, '← Senaryolar'),
    ornek && el('p', { class: 'kutu bilgi' }, 'Bu, önceden hazırlanmış örnek bir oturumun raporudur; gerçek bir kullanıcıya ait değildir ve yapay zekâ çağrısı yapmaz.'),
    el('p', { class: 'ustbaslik' + (ornek ? ' ornek-serit' : '') }, ornek ? 'Örnek rapor' : 'Oturum raporu'),
    el('h1', { tabindex: '-1' }, rapor.senaryo.baslik),
    el('div', { class: 'skor' }, skorHalkasi(rapor.toplam),
      el('div', {}, el('h2', {}, seviye), rapor.ozet && el('p', { class: 'soluk' }, rapor.ozet))),
    tekrar && el('p', { class: 'kucuk soluk' }, 'Bu kök nedenle daha önce karşılaşmıştın; gelişim grafiğinde yalnızca ilk denemen sayılır.'),
    varyantSayisi > 1 && el('p', { class: 'kutu bilgi uyari' }, `Bu senaryonun ${varyantSayisi} farklı kök nedeni var; bu oynayışta ${rapor.senaryo.varyantNo}. kök nedenle karşılaştın. ${kalanVaryant > 0 ? 'Tekrar oynarsan oynamadığın bir kök neden gelir: aşağıdaki soru kalıpları orada da işe yarar, cevaplar yaramaz.' : 'Hepsini oynadın.'}`),

    el('section', { class: 'bolum' }, el('h2', {}, 'Beş boyutta puanın'),
      el('ul', { class: 'boyutlar' }, rapor.boyutlar.map((b) => {
        const cubuk = el('i');
        cubuk.style.width = `${(b.puan / 5) * 100}%`;
        return el('li', { class: 'boyut' },
          el('div', { class: 'boyut-ust' }, b.ad, el('small', {}, `${b.puan} / 5 · ağırlık %${b.agirlik}`)),
          el('div', { class: 'cubuk' }, cubuk),
          b.yorum && el('p', {}, b.yorum),
          dayanakKutusu(b));
      }))),

    el('section', { class: 'bolum' }, el('h2', {}, 'Kök neden'),
      el('div', { class: 'karsilastir' },
        el('div', {}, el('h3', {}, 'Senin tahminin'), el('p', {}, rapor.tahmin || 'Tahmin yazmadın.')),
        el('div', { class: 'dogru' }, el('h3', {}, 'Senaryonun kök nedeni'), el('p', {}, rapor.kokNeden)))),

    el('section', { class: 'bolum' }, el('h2', {}, 'Ortaya çıkardığın bilgiler'),
      rapor.acilanlar.length
        ? el('ul', { class: 'liste acilan' }, rapor.acilanlar.map((b) => el('li', {}, el('span', {}, b.bilgi, b.onem === 'kritik' ? el('span', { class: 'etiket vurgu' }, 'Kritik') : null))))
        : el('p', { class: 'soluk' }, 'Bu oturumda gizli bilgilerden hiçbiri ortaya çıkmadı.')),
    rapor.kacirilanlar.length ? el('section', { class: 'bolum' }, el('h2', {}, 'Kaçırdıkların'),
      el('ul', { class: 'liste kacan' }, rapor.kacirilanlar.map((b) => el('li', {}, el('span', {}, b.bilgi, b.onem === 'kritik' ? el('span', { class: 'etiket uyari' }, 'Kritik') : null))))) : null,

    el('section', { class: 'bolum' }, el('h2', {}, 'Soru soru'),
      el('ol', { class: 'sorular' }, rapor.sorular.map((s) => el('li', { class: 'soru' },
        el('div', { class: 'soru-ust' }, el('b', {}, `Soru ${s.no}`),
          el('span', { class: 'etiket' + (s.tur === 'acik' ? ' vurgu' : '') }, s.tur === 'acik' ? 'Açık uçlu' : 'Kapalı'),
          s.yonlendirici && el('span', { class: 'etiket uyari' }, 'Yönlendirici')),
        el('blockquote', {}, s.soru),
        el('p', { class: 'cevap' }, `${rapor.senaryo.karakterAdi}: ${s.cevap}`),
        s.not && el('p', {}, s.not),
        s.dahaIyi && el('p', { class: 'oneri' }, el('b', {}, 'Şöyle sorabilirdin: '), s.dahaIyi),
        (s.tur !== 'acik' || s.yonlendirici) && yenidenDene(s))))),

    el('section', { class: 'bolum' }, el('h2', {}, 'İşe yarayan soru kalıpları'),
      el('ul', { class: 'liste duz' }, rapor.idealSorular.map((q) => el('li', {}, el('span', {}, q))))),

    el('div', { class: 'dugmeler bolum' },
      el('button', { class: 'dugme ana', onclick: anaSayfa }, ornek ? 'Kendin dene' : 'Başka bir senaryo'),
      !ornek && el('button', { class: 'dugme', onclick: () => anaSayfa().then(() => oturumBaslat(rapor.senaryo.id)) }, kalanVaryant > 0 ? 'Başka bir kök nedenle tekrar oyna' : 'Aynı senaryoyu tekrar oyna')),
  );
}


// --- Bu soruyu yeniden dene: tüm oturumu baştan oynamadan zayıf bir soruyu düzeltip farkı görmek ---
// Hızlı kontrol soru biçimine bakar (açık uçlu mu, varsayım ya da suçlama taşıyor mu). Yapay zekâ çağrısı yok;
// karakterin cevabını ve rapordaki puanı değiştirmez. Kurallar sahte modeldeki (src/cekirdek/model.js) ile aynı.
const ACIK_SORU = /(^|\s)(ne|neler|nasıl|neden|niçin|hangi|kim|kimler|nerede|ne zaman)(\s|\?|$)|anlat|bahseder|açıklar/;
const YONLENDIRICI_SORU = /değil mi|öyle değil|isteksiz|tembel|motivasyon|suç|yüzünden mi|fiyat(tan)? mı/;
function soruBicimi(metin) {
  const k = String(metin).toLocaleLowerCase('tr');
  return {
    acik: ACIK_SORU.test(k), yonlendirici: YONLENDIRICI_SORU.test(k),
    zaman: /ne zaman|tarih|hafta|gün|\bay(dan|da|ın|lar)?\b|dün|geçen|son (\d+|birkaç|iki|üç)|önce(si)?\b|vardiya|saat/.test(k),
    olcu: /kaç|ne kadar|yüzde|oran|sayı|adet|süre/.test(k),
    ornek: /örnek|somut|en son|bir kez|anlatır mısın|anlatabilir/.test(k),
    coklu: (k.match(/\?/g) || []).length > 1,
  };
}
// İki soru arasında değişen tek davranışı seçer: önce varsayım ve kapalılık, sonra ayrıntı (zaman, ölçü, örnek), en son çoklu soru.
function degisenDavranis(once, sonra) {
  if (once.yonlendirici && !sonra.yonlendirici) return 'İkinci sorunda varsayımı ya da suçlamayı çıkardın; nedeni karşı tarafa bıraktın.';
  if (!once.acik && sonra.acik) return 'İkinci sorunda evet/hayır yerine anlatmaya davet ettin.';
  if (!once.zaman && sonra.zaman) return 'İkinci sorunda zaman aralığını belirttin; cevap belli bir döneme bağlanacak.';
  if (!once.olcu && sonra.olcu) return 'İkinci sorunda ölçülebilir bir ayrıntı istedin (kaç, ne kadar, ne sıklıkta).';
  if (!once.ornek && sonra.ornek) return 'İkinci sorunda somut bir örnek istedin.';
  if (once.coklu && !sonra.coklu) return 'İkinci sorunda tek bir şey sordun; cevap dağılmayacak.';
  if (!once.yonlendirici && sonra.yonlendirici) return 'İkinci soru bir varsayım ekledi; ilk sorudaki tarafsızlığı geri getir.';
  if (once.acik && !sonra.acik) return 'İkinci soru kapalı hâle geldi; yeniden anlatmaya davet et.';
  return 'İki soru aynı davranışı gösteriyor. Bir şeyi değiştir: zaman aralığı, somut örnek ya da ölçü iste.';
}
function yenidenDene(s) {
  const kutu = el('div', { class: 'yeniden', hidden: true });
  const alan = el('textarea', { rows: 2, maxlength: 300, placeholder: 'Aynı amaçla yeni sorunu yaz', 'aria-label': `Soru ${s.no} için yeni soru` });
  const sonuc = el('div', { class: 'yeniden-sonuc', 'aria-live': 'polite' });
  const etiketler = (b) => [
    el('span', { class: 'etiket' + (b.acik ? ' vurgu' : '') }, b.acik ? 'Açık uçlu' : 'Kapalı'),
    b.yonlendirici ? el('span', { class: 'etiket uyari' }, 'Yönlendirici') : el('span', { class: 'etiket' }, 'Tarafsız'),
  ];
  const kontrol = () => {
    const metin = alan.value.trim();
    sonuc.replaceChildren();
    if (!metin) { sonuc.append(el('p', { class: 'soluk' }, 'Önce yeni sorunu yaz.')); return; }
    const once = { ...soruBicimi(s.soru || ''), acik: s.tur === 'acik', yonlendirici: !!s.yonlendirici }, sonra = soruBicimi(metin);
    const notlar = [];
    if (!sonra.acik) notlar.push('Hâlâ evet/hayırla cevaplanabilir. "Ne", "nasıl", "hangi" ya da "anlatır mısın" ile başlamayı dene.');
    if (sonra.yonlendirici) notlar.push('Soru hâlâ bir varsayım taşıyor (ör. "değil mi", "motivasyon", "suç"). Nedeni sen söyleme, ona sor.');
    if (sonra.acik && !sonra.yonlendirici) notlar.push('İyi bir soru. Gerçek oturumda bu soruyu, bir önceki cevabın ayrıntısına bağlayarak sor.');
    sonuc.append(
      el('div', { class: 'once-sonra iki' },
        el('div', {}, el('b', {}, 'İlk soru'), el('q', {}, s.soru || ''), el('div', { class: 'etiketler' }, ...etiketler(once))),
        el('div', {}, el('b', {}, 'İkinci soru'), el('q', {}, metin), el('div', { class: 'etiketler' }, ...etiketler(sonra)))),
      el('p', { class: 'degisen' }, el('b', {}, 'Değişen davranış: '), degisenDavranis(once, sonra)),
      el('ul', { class: 'liste duz' }, notlar.map((n) => el('li', {}, el('span', {}, n)))),
      el('p', { class: 'soluk' }, 'Bu hızlı kontrol yalnızca sorunun biçimine bakar; karakterin cevabını ve puanını değiştirmez.'));
  };
  const ac = el('button', { class: 'dugme kucuk', onclick: () => { kutu.hidden = !kutu.hidden; if (!kutu.hidden) alan.focus(); } }, 'Bu soruyu yeniden dene');
  kutu.append(alan, el('button', { class: 'dugme kucuk ana', onclick: kontrol }, 'Kontrol et'), sonuc);
  return el('div', { class: 'yeniden-dene' }, ac, kutu);
}

async function ornekGoster(gecmiseYaz = true) {
  try {
    durum.ornek ||= await istek('/ornek-oturum.json');
    if (gecmiseYaz === true) history.pushState(null, '', '#ornek');
    raporEkrani(durum.ornek, { ornek: true });
  } catch (err) {
    kok.querySelector('.kahraman')?.append(hataKutusu(err.message));
  }
}

// --- Geçişler ----------------------------------------------------------------------
document.querySelector('[data-git="ana"]').addEventListener('click', (e) => {
  e.preventDefault();
  if (!durum.oturum?.mesajlar.length || confirm('Oturumdan çıkarsan bu oturum hakkın geri gelmez. Çıkılsın mı?')) anaSayfa();
});
window.addEventListener('popstate', () => {
  if (location.hash === '#oturum' && durum.oturum) oturumEkrani();
  else if (location.hash === '#rapor' && durum.rapor) raporEkrani(durum.rapor);
  else if (location.hash === '#ornek') ornekGoster(false);
  else anaSayfa();
});
// Yarım oturum varken sekme kapanırsa tarayıcı onay sorar (oturum hakkı geri gelmez).
window.addEventListener('beforeunload', (e) => {
  if (durum.oturum?.mesajlar.length) e.preventDefault();
});

if (location.hash === '#ornek') anaSayfa().then(() => ornekGoster()); else anaSayfa();
