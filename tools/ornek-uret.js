// Ana sayfadaki "Örnek oturumu izle" raporunu üretir: web/ornek-oturum.json
// Konuşma ve etiketler elle yazılmıştır (gerçek bir kullanıcıya ait değildir); skor gerçek puanlama koduyla hesaplanır.
// Rubrik ya da senaryo değişirse yeniden çalıştır: npm run ornek
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { senaryolariYukle } from '../src/cekirdek/senaryolar.js';
import { oturumServisi } from '../src/cekirdek/oturum.js';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const ADIMLAR = [
  { soru: 'Ekip son zamanlarda isteksiz mi çalışıyor?', cevap: 'Biraz yorgunluk var tabii, gece çalışmak kolay değil.', acilan: [],
    tur: 'kapali', yonlendirici: true, not: 'Soru, nedeni baştan "isteksizlik" olarak varsayıyor; Serkan da hazır cevaba sığındı.', daha_iyi: 'Son haftalarda gece vardiyasında işler nasıl gidiyor?' },
  { soru: 'Verim düşmeden hemen önce depoda ne değişti?', cevap: 'Üç hafta kadar önce yeni adresleme düzenine geçildi. Gündüz ekibine eğitim verildi ama bize sıra gelmedi.', acilan: ['adresleme'],
    tur: 'acik', yonlendirici: false, not: 'Zamanlamayı soran açık bir soru; ilk kritik bilgiyi ortaya çıkardı.', daha_iyi: '' },
  { soru: 'Eğitim almadan yeni düzende toplayıcılar en çok nerede zorlanıyor?', cevap: 'Sık sık "adres bulunamadı" hatası alıyorlar. Ürünü aramakla vakit geçiyor.', acilan: ['adres-hatasi'],
    tur: 'acik', yonlendirici: false, not: 'Bir önceki cevabın üzerine kurulu; derinleşmenin iyi bir örneği.', daha_iyi: '' },
  { soru: 'Bu hata gündüz vardiyasında da oluyor mu?', cevap: 'Pek olmuyor.', acilan: [],
    tur: 'kapali', yonlendirici: false, not: 'Doğru yere bakıyorsun ama evet/hayır sorusu tek kelimelik cevap aldı; farkın nedeni açılmadı.', daha_iyi: 'Gündüz ekibinde olup gece ekibinde olmayan ne var?' },
  { soru: 'Gece ekibinde kimler çalışıyor, ekibin yapısı nasıl?', cevap: 'Ekibin yüzde kırkı kadarı geçici personel, onlar da sürekli değişiyor. Her gelene baştan anlatıyoruz.', acilan: ['gecici-personel'],
    tur: 'acik', yonlendirici: false, not: 'Ekibin yapısını soran açık bir soru; ikinci kritik bilgi ortaya çıktı.', daha_iyi: '' },
];
const TAHMIN = 'Yeni adresleme düzeni gece ekibine eğitim verilmeden devreye girmiş; geçici personel sürekli değiştiği için öğrenen de kalmıyor.';

let i = 0;
const model = {
  karakter: async () => ({ cevap: ADIMLAR[i].cevap, acilan: ADIMLAR[i++].acilan }),
  degerlendir: async () => ({
    sorular: ADIMLAR.map((a, n) => ({ no: n + 1, tur: a.tur, yonlendirici: a.yonlendirici, not: a.not, daha_iyi: a.daha_iyi })),
    derinlesme: { puan: 4, yorum: 'İkinci sorudan sonra cevapların peşine düştün: "ne değişti" sorusunu "nerede zorlanıyorlar" ile sürdürdün. Dördüncü soruda zincir koptu.' },
    sonuc: { puan: 4, yorum: 'Eğitim eksikliğini ve geçici personeli doğru birleştirdin. El terminallerinin gece güncellenmediği ortaya çıkmadığı için tahmin bir parça eksik kaldı.' },
    ozet: 'İlk sorudaki varsayımı bıraktığın anda bilgi gelmeye başladı. Bir sonraki denemede evet/hayır sorularını "ne" ve "nasıl" ile yeniden kur.',
  }),
};
const servis = oturumServisi({ senaryolar: senaryolariYukle(join(kok, 'senaryolar')), model, limit: () => ({ izin: true }) });
const { oturumId } = servis.baslat({ senaryoId: 'depo-verim-dususu' });
for (const a of ADIMLAR) await servis.soruSor({ oturumId, soru: a.soru });
const rapor = await servis.degerlendir({ oturumId, tahmin: TAHMIN });
writeFileSync(join(kok, 'web', 'ornek-oturum.json'), JSON.stringify(rapor, null, 2) + '\n');
console.log(`web/ornek-oturum.json yazıldı (skor ${rapor.toplam})`);
