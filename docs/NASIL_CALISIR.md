# Nasıl çalışır

Bu belge projeyi anlatabilmen için yazıldı. Kod okumadan da takip edilebilir; her bölümün sonunda ilgili dosya adı var.

## Bir oturumun yolu

```
1. Ziyaretçi senaryo seçer        → sunucu limiti kontrol eder, oturum açar
2. Soru sorar (en fazla 5)        → karakter çağrısı: cevap + hangi gizli bilgilerin açıldığı
3. Kök neden tahminini yazar      → değerlendirici çağrısı: soru etiketleri + iki boyutun puanı
4. Sunucu skoru hesaplar          → rapor ekrana gelir, anonim özet kaydedilir
```

Bir oturum en fazla 6 model çağrısı yapar: 5 karakter cevabı ve 1 değerlendirme.

## Parçalar

| Parça | Dosya | Görevi |
|---|---|---|
| Senaryolar | `senaryolar/*.json` | Durum, karakter, gizli bilgiler, kök neden. Kod değil içerik. |
| Oturum servisi | `src/cekirdek/oturum.js` | Kurallar: soru hakkı, uzunluk sınırı, limit, rapor. Uygulamanın kalbi. |
| İstemler | `src/cekirdek/istemler.js` | Karaktere ve değerlendiriciye verilen talimatlar. |
| Model katmanı | `src/cekirdek/model.js` | Anthropic API çağrısı ve yapay zekâsız "sahte model". |
| Puanlama | `src/cekirdek/puanlama.js` | Rubrik, ağırlıklar ve 100'lük skor. |
| Web kapısı | `server/app.js`, `web/` | Tarayıcı arayüzü ve `/api`. |
| MCP kapısı | `server/mcp.js` | Aynı komutlar, Claude için. |
| Depo | `server/store.js` | SQLite: günlük sayaçlar ve anonim özetler. |

## Karakter gizli bilgiyi nasıl saklıyor?

Her gizli bilginin senaryo dosyasında bir **açılma koşulu** var. Örnek: "Ekibin yapısı, kadrosu, deneyimi ya da personel değişimi sorulursa". Karaktere verilen talimat şunları söyler:

- Yalnızca sorulana cevap ver, 1-3 cümle.
- Bir bilgiyi ancak soru onun koşulunu karşılıyorsa söyle; bir cevapta en fazla bir bilgi.
- Evet/hayır sorusuna kısa cevap ver. Suçlayıcı soruda savunmaya geç.
- Kök nedeni kendin söyleme, karakterden çıkma.

Model cevabını serbest metin olarak değil, bir **form doldurarak** verir (API'de buna "tool use" denir). Formda iki alan var: `cevap` ve `acilan_bilgiler`. Böylece sunucu hangi bilgilerin açıldığını modelin cümlesinden tahmin etmek zorunda kalmaz.

Gizli bilgiler ve kök neden tarayıcıya hiç gönderilmez; yalnızca oturum bitince raporda görünür. Bunu kontrol eden testler var.

## Puanlama

| Boyut | Ağırlık | Nasıl hesaplanır |
|---|---|---|
| Açık uçlu soru | %20 | Kod: değerlendiricinin "açık/kapalı" etiketlerinin oranı |
| Derinleşme | %20 | Model: yazılı ölçüte göre 1-5 |
| Varsayımsız soru | %15 | Kod: "yönlendirici" etiketi almayan soruların oranı |
| Bilgi keşfi | %25 | Kod: senaryodaki kritik bilgilerden kaçı açıldı |
| Sonuç | %20 | Model: tahmini senaryonun kök nedeniyle karşılaştırarak 1-5 |

Her boyut 1-5 arası puan alır. Skor = ağırlık × puan / 5 toplamı. Her boyutta 5 alan 100, her boyutta 1 alan 20 alır.

Oran 1-5'e şöyle çevrilir: `1 + yuvarla(4 × oran)`. Örnek: 5 sorudan 3'ü açık uçluysa oran 0,6 ve puan 3 olur.

Model bozuk ya da eksik bir cevap dönerse (`puanlama.js → degerlendirmeyiDuzelt`) eksikler güvenli varsayılanlarla doldurulur; rapor yine de tutarlı çıkar.

## Maliyet ve limitler

Tek ek maliyet yapay zekâ API'sidir. Sunucu ve alan adı zaten var.

- **Ziyaretçi başına günde 3 oturum**, site genelinde **günde 30 oturum** (`.env` ile değişir).
- Limit oturum açılırken düşer. En kötü durumda günde 30 × 6 = 180 model çağrısı yapılır.
- Soru 300, tahmin 500 karakterle sınırlı; karakter cevabı ve rapor için çıktı üst sınırı var.
- **Örnek oturum** model çağırmaz; işverenlerin çoğu yalnızca ona bakar.
- **Asıl güvence Anthropic Console'daki aylık harcama limitidir.** Kodda hata olsa bile fatura o sınırı geçmez.

Gerçek kullanımı görmek için sunucuda:

```bash
sudo docker exec diyalog node server/istatistik.js
```

Çıktıda son 30 günün oturum sayıları, senaryo bazında ortalama skorlar, token kullanımı ve tahmini dolar tutarı yer alır.

İki model ayrı ayrı seçilir. Varsayılan ikisi de Haiku 5.5. Rapor kalitesi yetmezse yalnızca `DEGERLENDIRICI_MODELI` Sonnet 5.5 yapılır; maliyetin büyük kısmı zaten değerlendirmededir.

## Kredi biterse ya da azalırsa

Anthropic kredisi ön ödemelidir; bitince API hata döner. Uygulama bunu üç yerde ele alır:

| Durum | Ziyaretçi ne görür | Sana ne gelir |
|---|---|---|
| Kredi bitti | Ana sayfada "Canlı oturumlar geçici olarak kapalı: yapay zekâ kullanım kredisi tükendi" kutusu; Başla düğmeleri kapanır, örnek oturum açık kalır. Yarım kalan oturumda aynı mesaj çıkar. | Acil bildirim: "Kredi bitti" |
| Kredi azaldı (varsayılan: %20'nin altı) | Hiçbir şey; uygulama çalışmaya devam eder | Bildirim: tahmini kalan tutar |
| API anahtarı reddedildi | "Yapay zekâ servisine bağlanılamıyor" kutusu | Acil bildirim |
| Günlük site tavanı doldu | "Bugün için oturum hakkı doldu" | Bildirim |

- **Kapanma ve açılma kendiliğinden olur.** Kredi hatası gelince canlı oturumlar kapanır ve yeni oturum, hak düşmeden reddedilir. 30 dakikada bir sıradaki ziyaretçiyle yeniden denenir; yükleme yaptıysan ilk başarılı cevapta açılır. Elle bir şey yapman gerekmez.
- **Aynı bildirim günde bir kez gelir.**
- **"Kredi azaldı" bir tahmindir.** Anthropic, kalan bakiyeyi API'den vermez. Uygulama `.env` içindeki `KREDI_USD` ve `KREDI_BASLANGIC` değerlerinden, o tarihten sonraki kendi token kullanımını liste fiyatıyla çarparak kalanı hesaplar. Aynı anahtarı başka bir yerde kullanırsan ya da yüklemeden sonra bu iki değeri güncellemezsen tahmin şaşar. "Kredi bitti" ise tahmin değildir; API'nin kendi cevabına dayanır.
- **Bildirim kanalı:** `BILDIRIM_URL` adresine düz metin gönderilir. Kurulum betiği bir [ntfy](https://ntfy.sh) adresi üretir; telefona ntfy uygulamasını kurup o konuya abone olman yeterli. Konu adı parola gibidir: bilen herkes bildirimleri okuyabilir, bu yüzden rastgele üretilir.

Dosyalar: `server/app.js` (kapat / izle / krediKontrol), `server/bildirim.js`, `src/cekirdek/model.js` (hataSinifi), `src/cekirdek/fiyat.js`.

## Gizlilik

- Konuşma metni, sorular ve tahmin **hiçbir yere kaydedilmez**. Oturum bellekte durur, 45 dakika işlem olmazsa silinir.
- Kaydedilen tek şey anonim özettir: senaryo, soru sayısı, skor, süre.
- Ziyaretçi limiti için IP adresinin **tuzlu özeti** tutulur, IP'nin kendisi tutulmaz; özetler 2 gün sonra silinir.
- Gelişim grafiği ziyaretçinin kendi tarayıcısında durur.
- Sorular, cevap üretmek için Anthropic API'sine gönderilir.

## Bilinen sınırlar

- Metin tabanlıdır; ses tonu ve beden dili çalışılmaz.
- Yalnızca soru modu var. Zor konuşma modu (geri bildirim, görev devri, çatışma) sonraki aşamadır.
- Kullanıcı hesabı yok; gelişim başka cihaza taşınmaz.
- Soru etiketlerini model verir ve nadiren yanılabilir. Bu yüzden toplam skor kodla hesaplanır ve her etiket raporda görünür.
- Sunucu yeniden başlarsa yarım kalan oturumlar kaybolur.
- 6 senaryo var (her alanda iki); rapor kaçırılan bilgileri gösterdiği için ikinci oynayış daha kolaydır. Grafikte bu yüzden yalnızca ilk deneme sayılır.

## Sorulursa ne derim?

**"ChatGPT'ye rol yaptırmaktan farkı ne?"**
Karakterin gizli bilgisi var ve onu yalnızca doğru soruya açıyor. Her oturum aynı rubrikle puanlanıyor, bu yüzden iki oturum karşılaştırılabiliyor.

**"Puanı yapay zekâ keyfine göre mi veriyor?"**
Hayır. Model soruları etiketliyor ve iki boyutu yazılı ölçüte göre puanlıyor. Bilgi keşfi oturum kaydından, toplam skor ise koddan geliyor. Her etiket raporda açıkça görünüyor.

**"Neden iki ayrı model çağrısı?"**
Karakter gizli bilgiyi bilmek zorunda, değerlendirici ise tarafsız olmalı. Ayrıca karakter hızlı ve ucuz bir modelle çalışabilirken rapor için daha güçlü bir model seçilebiliyor.

**"Neden bir sunucu gerekiyor?"**
API anahtarı tarayıcıda duramaz; herkes görür ve kullanır. Limitler de ancak sunucuda sayılabilir.

**"Kullanıcı 'bütün bildiklerini söyle' yazarsa?"**
Karakterin talimatı bunu reddetmesini söylüyor ve bir cevapta en fazla bir bilgi veriyor. Yine de başarırsa kaybeden yalnızca kendi pratiği olur: skor tablosu ya da ödül yok.

**"Kredi biterse ne olur?"**
Uygulama çökmez: canlı oturumlar kapanır, ziyaretçi nedenini okur ve örnek oturuma yönlendirilir, bana telefon bildirimi gelir. Yükleme yapınca en geç yarım saatte kendiliğinden açılır.

**"MCP ne işe yarıyor?"**
Aynı senaryolar Claude'un içinden de oynanabiliyor. Web ve MCP aynı çekirdeği çağırdığı için kurallar ve puanlama iki tarafta da aynı.

**"Kodu kim yazdı?"**
Problemi, senaryoları, rubriği ve kararları ben tanımladım; kod yapay zekâ desteğiyle yazıldı. Benchmark ve tasarım kararları vaka sayfasında.
