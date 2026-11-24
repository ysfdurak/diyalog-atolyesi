// Senaryolar: her senaryo senaryolar/ klasöründe tek bir JSON dosyasıdır.
// Yeni senaryo eklemek kod değil içerik işidir: dosyayı ekle, sunucuyu yeniden başlat.
// Açılışta her dosya doğrulanır; hatalı senaryo ile sunucu başlamaz (yayında sürpriz olmasın diye).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const metin = (v) => typeof v === 'string' && v.trim().length > 0;

// Varyant: aynı durum (açılış, karakter, rol) ama farklı kök neden. Oturum başlarken biri seçilir;
// böylece rapor bir senaryoyu "yakmaz", tekrar oynayan kişi cevabı değil soru kalıbını kullanır.
// Varyanta özel alanlar: gizli_bilgiler, kok_neden, kok_neden_kelimeler.
// Ortak ya da varyanta özel olabilenler: yaniltici_ipuclari, ideal_sorular (varyanttaki önceliklidir).
// "varyantlar" olmayan eski biçimdeki dosyalar tek varyantlı ("v1") sayılır.
const VARYANT_ALANLARI = ['gizli_bilgiler', 'kok_neden', 'kok_neden_kelimeler'];

/** Bir varyantın oyunda kullanılan içeriği: varyant alanları + (varsa varyantın, yoksa senaryonun) ortak alanları */
function varyantIcerigi(s, v) {
  return {
    gizli_bilgiler: v.gizli_bilgiler,
    kok_neden: v.kok_neden,
    kok_neden_kelimeler: v.kok_neden_kelimeler || [],
    yaniltici_ipuclari: v.yaniltici_ipuclari ?? s.yaniltici_ipuclari,
    ideal_sorular: v.ideal_sorular ?? s.ideal_sorular,
  };
}

function icerikDogrula(x, onEk) {
  const h = [];
  if (!metin(x.kok_neden)) h.push(`${onEk}"kok_neden" boş olamaz.`);
  const bilgiler = Array.isArray(x.gizli_bilgiler) ? x.gizli_bilgiler : [];
  if (!bilgiler.some((b) => b.onem === 'kritik')) h.push(`${onEk}En az bir "kritik" gizli bilgi olmalı.`);
  const idler = new Set();
  for (const b of bilgiler) {
    if (!metin(b.id) || !metin(b.bilgi) || !metin(b.acilma_kosulu)) h.push(`${onEk}Her gizli bilgide "id", "bilgi" ve "acilma_kosulu" olmalı.`);
    if (!['kritik', 'destek'].includes(b.onem)) h.push(`${onEk}Gizli bilgi "${b.id}": "onem" kritik ya da destek olmalı.`);
    if (idler.has(b.id)) h.push(`${onEk}Gizli bilgi kimliği yineleniyor: ${b.id}`);
    idler.add(b.id);
  }
  if (!Array.isArray(x.ideal_sorular) || !x.ideal_sorular.length) h.push(`${onEk}"ideal_sorular" en az bir soru içermeli.`);
  if (!Array.isArray(x.yaniltici_ipuclari)) h.push(`${onEk}"yaniltici_ipuclari" bir liste olmalı.`);
  return h;
}

/** Senaryo dosyasındaki eksik ve hatalı alanları listeler. Boş liste = geçerli. */
export function senaryoDogrula(s) {
  const h = [];
  if (!s || typeof s !== 'object') return ['Senaryo bir nesne olmalı.'];
  if (s.sektor !== undefined && (typeof s.sektor !== 'string' || !s.sektor.trim())) hatalar.push('sektor boş olmayan bir metin olmalı');
  for (const alan of ['id', 'baslik', 'yetkinlik', 'alan', 'acilis', 'rolun']) {
    if (!metin(s[alan])) h.push(`"${alan}" boş olamaz.`);
  }
  if (metin(s.id) && !/^[a-z0-9-]+$/.test(s.id)) h.push('"id" yalnızca küçük harf, rakam ve tire içerebilir.');
  if (s.mod !== 'soru') h.push('"mod" şimdilik yalnızca "soru" olabilir.');
  if (![1, 2, 3].includes(s.zorluk)) h.push('"zorluk" 1, 2 ya da 3 olmalı.');
  if (!Number.isInteger(s.soru_hakki) || s.soru_hakki < 2 || s.soru_hakki > 10) h.push('"soru_hakki" 2-10 arası tam sayı olmalı.');
  const k = s.karakter || {};
  for (const alan of ['ad', 'rol', 'tavir', 'ilk_soz']) if (!metin(k[alan])) h.push(`"karakter.${alan}" boş olamaz.`);

  if (s.varyantlar === undefined) return [...h, ...icerikDogrula(s, '')];
  if (!Array.isArray(s.varyantlar) || !s.varyantlar.length) return [...h, '"varyantlar" boş olmayan bir liste olmalı.'];
  if (VARYANT_ALANLARI.some((a) => a in s)) h.push('"varyantlar" kullanılırken "gizli_bilgiler", "kok_neden" ve "kok_neden_kelimeler" en üstte değil, her varyantın içinde olmalı.');
  const idler = new Set();
  for (const v of s.varyantlar) {
    const ad = v?.id;
    if (!metin(ad) || !/^[a-z0-9-]+$/.test(ad)) h.push('Her varyantın "id" alanı olmalı (küçük harf, rakam, tire; ör. v1).');
    else if (idler.has(ad)) h.push(`Varyant kimliği yineleniyor: ${ad}`);
    idler.add(ad);
    h.push(...icerikDogrula(varyantIcerigi(s, v || {}), `Varyant "${ad}": `));
  }
  return h;
}

/** Eski biçimi (varyantsız) tek varyantlı biçime çevirir; geri kalan kod her zaman "varyantlar" görür. */
function normallestir(s) {
  if (s.varyantlar) return s;
  const { gizli_bilgiler, kok_neden, kok_neden_kelimeler, ...temel } = s;
  return { ...temel, varyantlar: [{ id: 'v1', gizli_bilgiler, kok_neden, kok_neden_kelimeler }] };
}

/** Senaryonun bir varyantını oynanabilir tek nesneye çevirir (karakter istemi ve puanlama bunu kullanır). */
export function varyantCozumle(s, varyantId) {
  const sira = s.varyantlar.findIndex((v) => v.id === varyantId);
  if (sira < 0) throw new Error(`"${s.id}" senaryosunda "${varyantId}" varyantı yok.`);
  const { varyantlar, ...temel } = s;
  return { ...temel, ...varyantIcerigi(s, varyantlar[sira]), varyant: varyantlar[sira].id, varyantNo: sira + 1, varyantSayisi: varyantlar.length };
}

/** Klasördeki tüm senaryoları okur ve doğrular. Hata varsa hepsini tek mesajda fırlatır. */
export function senaryolariYukle(klasor) {
  const senaryolar = new Map();
  const hatalar = [];
  for (const dosya of readdirSync(klasor).filter((d) => d.endsWith('.json')).sort()) {
    let s;
    try {
      s = JSON.parse(readFileSync(join(klasor, dosya), 'utf8'));
    } catch (err) {
      hatalar.push(`${dosya}: JSON okunamadı (${err.message})`);
      continue;
    }
    const h = senaryoDogrula(s);
    if (h.length) hatalar.push(`${dosya}: ${h.join(' ')}`);
    else if (senaryolar.has(s.id)) hatalar.push(`${dosya}: "${s.id}" kimliği başka bir dosyada da var.`);
    else senaryolar.set(s.id, normallestir(s));
  }
  if (hatalar.length) throw new Error('Senaryo hataları:\n - ' + hatalar.join('\n - '));
  if (!senaryolar.size) throw new Error(`Senaryo bulunamadı: ${klasor}`);
  return senaryolar;
}

/** Oyuncuya gösterilebilecek alanlar. Gizli bilgiler, kök neden ve varyant içerikleri ASLA buradan geçmez. */
/** Sektör alanı isteğe bağlı; yazılmamışsa senaryo depo ve lojistik dünyasındandır. */
export const VARSAYILAN_SEKTOR = 'Depo ve lojistik';

export function herkeseAcik(s) {
  return {
    id: s.id,
    baslik: s.baslik,
    yetkinlik: s.yetkinlik,
    alan: s.alan,
    sektor: s.sektor || VARSAYILAN_SEKTOR,
    zorluk: s.zorluk,
    sureDk: s.sure_dk || null,
    acilis: s.acilis,
    rolun: s.rolun,
    soruHakki: s.soru_hakki,
    varyantlar: s.varyantlar.map((v) => v.id), // yalnızca kimlikler (v1, v2…); içerik rapora kadar gizli
    karakter: { ad: s.karakter.ad, rol: s.karakter.rol, ilkSoz: s.karakter.ilk_soz },
  };
}

/** Günün senaryosu: tarihe göre sırayla döner, herkes aynı gün aynı senaryoyu görür. */
export function gununSenaryosu(senaryolar, gun) {
  const liste = [...senaryolar.values()];
  const gunNo = Math.floor(Date.parse(gun + 'T00:00:00Z') / 86400000);
  return liste[((gunNo % liste.length) + liste.length) % liste.length];
}
