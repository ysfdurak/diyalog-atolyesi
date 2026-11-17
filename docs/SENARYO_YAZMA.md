# Senaryo yazma

Yeni senaryo eklemek kod gerektirmez: `senaryolar/` klasörüne bir JSON dosyası ekle, sunucuyu yeniden başlat. Açılışta her dosya doğrulanır; hatalı senaryoyla sunucu başlamaz ve neyin eksik olduğunu söyler.

En kolay yol: var olan bir dosyayı kopyalayıp değiştirmek.

## Alanlar

| Alan | Açıklama |
|---|---|
| `id` | Küçük harf, rakam ve tire. Dosya adıyla aynı olması okunurluğu artırır. |
| `baslik` | Soru biçiminde başlık: "… neden …?" |
| `yetkinlik`, `mod` | Şimdilik `soru-sorma` ve `soru`. |
| `zorluk` | 1-3. |
| `alan` | Kartta görünen etiket: Operasyon, İş geliştirme, Ekip yönetimi… |
| `acilis` | Oyuncunun okuduğu durum, 2-3 cümle. Somut bir rakam ve "kiminle konuşuyorsun" içersin. |
| `rolun` | Oyuncunun rolü ve amacı. |
| `karakter` | `ad`, `rol`, `tavir` (nasıl davranır, neye açılır), `ilk_soz`. |
| `gizli_bilgiler` | Her biri: `id`, `onem` (kritik/destek), `bilgi`, `acilma_kosulu`, `ipucu_kelimeler`. |
| `yaniltici_ipuclari` | Karakterin kötü soruya sığındığı yüzeysel açıklamalar. |
| `kok_neden` | Değerlendiricinin karşılaştırdığı gerçek neden. Tek ya da iki cümle. |
| `kok_neden_kelimeler` | Yalnızca yapay zekâsız deneme modu için. |
| `soru_hakki` | 2-10; alışılmış değer 5. |
| `ideal_sorular` | Raporda "işe yarayan sorular" olarak görünür. |

`ipucu_kelimeler` ve `kok_neden_kelimeler` yalnızca yapay zekâsız deneme modunda (`MODEL_MODE=mock`) kullanılır; gerçek model `acilma_kosulu` metnine bakar.

## Varyantlar: aynı durum, farklı kök neden

Rapor kök nedeni ve kaçırılan bilgileri gösterdiği için tek kök nedenli bir senaryo bir kez oynanınca "yanar". Varyantlar bunu önler: açılış, karakter ve rol aynı kalır; gizli bilgiler ve kök neden değişir. Oturum başlarken, kişinin bu tarayıcıda henüz oynamadığı varyantlardan biri rastgele seçilir. Hepsini oynadıysa tümü arasından seçilir.

```json
{
  "id": "depo-verim-dususu",
  "acilis": "…", "karakter": { … }, "soru_hakki": 5,
  "yaniltici_ipuclari": ["…"],
  "ideal_sorular": ["…"],
  "varyantlar": [
    { "id": "v1", "not": "Yazar notu, oyunda kullanılmaz", "gizli_bilgiler": [ … ], "kok_neden": "…", "kok_neden_kelimeler": ["…"] },
    { "id": "v2", "gizli_bilgiler": [ … ], "kok_neden": "…", "ideal_sorular": ["Bu varyanta özel sorular (isteğe bağlı)"] }
  ]
}
```

- **Varyanta özel:** `gizli_bilgiler`, `kok_neden`, `kok_neden_kelimeler`. `varyantlar` kullanılıyorsa bunlar en üstte olamaz.
- **Ortak, isteğe bağlı olarak varyantta değiştirilebilir:** `yaniltici_ipuclari`, `ideal_sorular`.
- **Kimlik:** `v1`, `v2`… Ziyaretçi yalnızca kimliği görür, içeriği rapora kadar görmez. Yayındaki bir varyantın kimliğini değiştirme; tarayıcılardaki gelişim kaydı bu kimliğe bağlı.
- `varyantlar` olmayan dosyalar tek varyantlı (`v1`) sayılır.

**İyi varyantın ölçütleri**

1. **Açılış metni her varyanta uymalı.** "Gündüz etkilenmedi" diyorsa her varyantta gece bunun bir nedeni olmalı.
2. **Aynı soru kalıbı farklı cevaba götürmeli.** "Ne değişti?" sorusu bir varyantta adreslemeyi, başka birinde ekip küçülmesini açar. Kişi önceki raporu değil, soru kalıbını kullanmayı öğrenir.
3. **En az bir varyant beklenmedik yerden gelmeli.** Örneğin "verim düşmedi, ölçü yanıltıyor". Bu, "sorun gerçekten var mı?" sorusunu öğretir.

## İyi senaryonun ölçütleri

1. **Yüzeyde insan sorunu, kökte süreç sorunu.** "Ekip isteksiz", "müşteri fiyata bakıyor", "motivasyonu düşük" gibi ilk akla gelen açıklama yanlış çıkmalı.
2. **Üç kritik bilgi, birbirini tamamlayan.** Tek başına hiçbiri kök nedeni vermemeli.
3. **Her kritik bilgi farklı bir soru türüyle açılmalı:** ne değişti, kim etkileniyor, iş nerede takılıyor.
4. **Açılma koşulu suçlamayla karşılanmamalı.** "Eğitim mi eksik?" sorusu kapalı ve yönlendirici olduğu için bilgi getirmemeli; "Ne değişti?" getirmeli.
5. **Gerçek şirket ya da kişi adı yok.** Rakamlar kurgusal.

## Kontrol

```bash
npm test                 # senaryo doğrulaması dahil
npm run start:dev        # deneme modunda oyna
```

Yeni senaryoyu gerçek modelle en az iki kez oyna: bir kez iyi sorularla, bir kez kötü sorularla. Kötü sorular kritik bilgiyi açıyorsa `acilma_kosulu` çok gevşektir.
