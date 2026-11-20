// Anonim kullanım ölçümü ve geri bildirim düğmesi (ortak servis: olcum.ysfdurak.com; kaynak: ysfdurak.com → sunucu/olcum).
// Yalnız resmî demo adresinde yüklenir: kendi sunucusuna kurulan kopyalar dışarıya hiç istek atmaz.
// Gönderilenler: ekran adı, aktif süre, cihaz türü, dil. Konuşma içeriği, ad, IP gönderilmez; çerez yok; DNT/GPC'ye uyar.
if (location.hostname === 'diyalog.ysfdurak.com') {
  const s = document.createElement('script');
  s.src = 'https://olcum.ysfdurak.com/olcum.js';
  s.defer = true;
  s.dataset.proje = 'diyalog';
  s.dataset.ekran = 'otomatik';
  s.dataset.renk = '#24423a';
  document.head.appendChild(s);
}
