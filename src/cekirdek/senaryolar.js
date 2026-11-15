// Senaryolar: her senaryo senaryolar/ klasöründe tek bir JSON dosyasıdır.
// Yeni senaryo eklemek kod değil içerik işidir: dosyayı ekle, sunucuyu yeniden başlat.
// Açılışta her dosya doğrulanır; hatalı senaryo ile sunucu başlamaz (yayında sürpriz olmasın diye).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const metin = (v) => typeof v === 'string' && v.trim().length > 0;

/** Senaryo dosyasındaki eksik ve hatalı alanları listeler. Boş liste = geçerli. */
export function senaryoDogrula(s) {
  const h = [];
  if (!s || typeof s !== 'object') return ['Senaryo bir nesne olmalı.'];
  for (const alan of ['id', 'baslik', 'yetkinlik', 'alan', 'acilis', 'rolun', 'kok_neden']) {
    if (!metin(s[alan])) h.push(`"${alan}" boş olamaz.`);
  }
  if (metin(s.id) && !/^[a-z0-9-]+$/.test(s.id)) h.push('"id" yalnızca küçük harf, rakam ve tire içerebilir.');
  if (s.mod !== 'soru') h.push('"mod" şimdilik yalnızca "soru" olabilir.');
  if (![1, 2, 3].includes(s.zorluk)) h.push('"zorluk" 1, 2 ya da 3 olmalı.');
  if (!Number.isInteger(s.soru_hakki) || s.soru_hakki < 2 || s.soru_hakki > 10) h.push('"soru_hakki" 2-10 arası tam sayı olmalı.');
  const k = s.karakter || {};
  for (const alan of ['ad', 'rol', 'tavir', 'ilk_soz']) if (!metin(k[alan])) h.push(`"karakter.${alan}" boş olamaz.`);
  const bilgiler = Array.isArray(s.gizli_bilgiler) ? s.gizli_bilgiler : [];
  if (!bilgiler.some((b) => b.onem === 'kritik')) h.push('En az bir "kritik" gizli bilgi olmalı.');
  const idler = new Set();
  for (const b of bilgiler) {
    if (!metin(b.id) || !metin(b.bilgi) || !metin(b.acilma_kosulu)) h.push('Her gizli bilgide "id", "bilgi" ve "acilma_kosulu" olmalı.');
    if (!['kritik', 'destek'].includes(b.onem)) h.push(`Gizli bilgi "${b.id}": "onem" kritik ya da destek olmalı.`);
    if (idler.has(b.id)) h.push(`Gizli bilgi kimliği yineleniyor: ${b.id}`);
    idler.add(b.id);
  }
  if (!Array.isArray(s.ideal_sorular) || !s.ideal_sorular.length) h.push('"ideal_sorular" en az bir soru içermeli.');
  if (!Array.isArray(s.yaniltici_ipuclari)) h.push('"yaniltici_ipuclari" bir liste olmalı.');
  return h;
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
    else senaryolar.set(s.id, s);
  }
  if (hatalar.length) throw new Error('Senaryo hataları:\n - ' + hatalar.join('\n - '));
  if (!senaryolar.size) throw new Error(`Senaryo bulunamadı: ${klasor}`);
  return senaryolar;
}

/** Oyuncuya gösterilebilecek alanlar. Gizli bilgiler ve kök neden ASLA buradan geçmez. */
export function herkeseAcik(s) {
  return {
    id: s.id,
    baslik: s.baslik,
    yetkinlik: s.yetkinlik,
    alan: s.alan,
    zorluk: s.zorluk,
    sureDk: s.sure_dk || null,
    acilis: s.acilis,
    rolun: s.rolun,
    soruHakki: s.soru_hakki,
    karakter: { ad: s.karakter.ad, rol: s.karakter.rol, ilkSoz: s.karakter.ilk_soz },
  };
}

/** Günün senaryosu: tarihe göre sırayla döner, herkes aynı gün aynı senaryoyu görür. */
export function gununSenaryosu(senaryolar, gun) {
  const liste = [...senaryolar.values()];
  const gunNo = Math.floor(Date.parse(gun + 'T00:00:00Z') / 86400000);
  return liste[((gunNo % liste.length) + liste.length) % liste.length];
}
