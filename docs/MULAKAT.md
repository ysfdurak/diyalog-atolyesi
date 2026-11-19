# Mülakatta sorulabilecek sorular · Diyalog Atölyesi

Bu kart, projeyi kendi ağzınla anlatabilmen için. Cevaplar kısa tutuldu; ayrıntısı belirtilen belgede. Kod yapay zekâ (Claude) ile yazıldı; kapsam, öncelik ve aşağıdaki kararlar senin. Bunu saklama, açıkça söyle: "Ürünü ve kararları ben belirledim, kodu yapay zekâyla yazdım, her kararın nedenini anlatabilirim."

**1. Bu proje ne yapıyor?**
Yöneticiler için doğru soru sorma pratiği. Bir senaryo seçiyorsun, karakterle konuşarak 5 soruda kök nedeni bulmaya çalışıyorsun; soruların açık uçluluk, derinleşme ve varsayımsızlık açısından değerlendiriliyor.

**2. Neden cevabı değil soruyu çalıştırıyor?**
Yöneticilikte sorun çoğu zaman yanlış cevap değil, yanlış sorudur: kapalı, yönlendiren ya da varsayım içeren soru kök nedeni saklar.

**3. Yapay zekâ nerede, neden?**
Karakterin cevapları ve değerlendirme Claude ile üretiliyor. Karakter gizli bir bilgi saklıyor ve yalnız doğru soruda açıyor; bunu kural tabanlı yazmak çok kısıtlı olurdu.

**4. Maliyeti nasıl kontrol ediyorsun?**
Ziyaretçi başına günde 3, site genelinde günde 30 oturum; kredi bitince canlı oturum kapanır ve örnek oturuma yönlendirilir. Anthropic konsolunda da harcama tavanı olmalı.

**5. Kişisel veri?**
Sorular Anthropic'e (ABD) gidiyor. İlk soruda bu yazıyor, ayrı bir gizlilik sayfası var. Konuşma sunucuda yalnız bellekte, 45 dakika sonra siliniyor; IP'nin kendisi değil tuzlu özeti tutuluyor.

**6. Sınırlar sahte IP ile aşılabilir mi?**
Artık hayır. Önceden ziyaretçinin yazabildiği bir başlık okunuyordu; şimdi IP yalnız sunucunun önündeki vekilden ya da Cloudflare adreslerinden gelirse okunuyor.

**7. Teknik yapı?**
Node.js sunucu, sade JavaScript arayüz, SQLite (yalnız sayaç ve anonim özet), VPS'te Docker. MCP kapısı da var.

**8. Değerlendirme ne kadar güvenilir?**
Modele bağlı ve hata yapabilir; sayfada yazıyor. Tutarlılığı ölçmek için örnek iyi ve zayıf soru setleriyle düzenli kontrol gerekir; bu henüz yapılmadı.

**9. Kurum içinde nasıl kullanılır?**
Kurgusal senaryolarla eğitimde; gerçek kişi ya da şirket bilgisi yazılmaması gerekir. Kurum kendi sunucusuna kurabilir.

**10. Neyi farklı yapardın?**
Gizlilik sayfasını ve IP okuma kuralını baştan yazardım; ikisi de sonradan eklendi.


## Bu projede verdiğim kararlar (sorun → karar → bedel)

- **Yurt dışına aktarım:** Sorular ABD'ye gidiyor → ilk soruda not ve ayrı gizlilik sayfası → kullanıcıyı uyarmak dışında aktarımı engellemiyor.
- **Sahte IP başlığı:** Ziyaretçi sınırı başlıkla aşılabiliyordu → güvenilen vekil kuralı → Cloudflare adres listesi elle güncel tutulmalı.

---
Son güncelleme: 19 Kasım 2026.
