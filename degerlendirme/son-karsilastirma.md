# Değerlendirici ↔ uzman karşılaştırması

Değerlendirici: **sahte (kural tabanlı)** · set: 8 konuşma, 30 soru · tarih: 2026-11-19

> **Set taslak:** Etiketler Claude tarafından hazırlanmış taslaktır; uzman onayı bekliyor. Cevaplar sahte karakterle üretildi (sabit). Bir uzman her öğede uzman alanlarını gözden geçirip durumu "onaylandi" yapmalı. Bu sonuçlar uzman uyumunu değil, aracın çalıştığını gösterir.

| Ölçü | Uyum | Not |
| --- | ---: | --- |
| Soru türü (açık/kapalı) | %100 · κ 1.00 | Açık uçlu soru boyutunu belirler |
| Yönlendirici etiketi | %87 · κ 0.44 | Varsayımsız soru boyutunu belirler |
| Derinleşme (1–5) | aynı %25 · ±1 %63 · ort. fark 1.13 | Modelin puanladığı boyut |
| Sonuç (1–5) | aynı %75 · ±1 %75 · ort. fark 0.50 | Modelin puanladığı boyut |
| Toplam skor (100) | ort. fark 8.38 · en büyük 15 | Kod boyutları dahil |

Kabul ölçütü önerisi (uzman onaylı sette): soru türü ve yönlendirici κ ≥ 0,6; derinleşme ve sonuçta ±1 uyum ≥ %80; toplam skorda ortalama fark ≤ 10.

## Uyuşmazlıklar

### u1 · depo-verim-dususu (iyi) · toplam model 83 / uzman 87
- Uyuşmazlık yok.

### u2 · depo-verim-dususu (zayif) · toplam model 31 / uzman 23
- Derinleşme: model **3**, uzman **1**. Model yorumu: Bazı cevapların peşine düştün, bazıları havada kaldı.

### u3 · geciken-teslimler (orta) · toplam model 83 / uzman 72
- Soru 3 “Neden bunu daha önce söylemedin?”: yönlendirici model **false**, uzman **true**. Model notu: Karşı tarafı konuşturan açık bir soru.
- Sonuç: model **5**, uzman **3**. Model yorumu: Tahminin kök nedenle örtüşüyor. · Tahmin: “İş yükü arttı ve raporlar elle hazırlandığı için gecikiyor.”

### u4 · musteri-sozlesme (iyi) · toplam model 87 / uzman 91
- Uyuşmazlık yok.

### u5 · musteri-sozlesme (zayif) · toplam model 48 / uzman 34
- Soru 1 “Fiyatı yüzde 10 düşürürsek kalır mısınız?”: yönlendirici model **false**, uzman **true**. Model notu: Bu soru kısa bir cevapla geçiştirilebiliyor.
- Derinleşme: model **3**, uzman **1**. Model yorumu: Bazı cevapların peşine düştün, bazıları havada kaldı.

### u6 · yanlis-sevkiyat (iyi) · toplam model 92 / uzman 100
- Derinleşme: model **3**, uzman **5**. Model yorumu: Bazı cevapların peşine düştün, bazıları havada kaldı.

### u7 · erken-ayrilanlar (orta) · toplam model 80 / uzman 77
- Soru 3 “Ücretten mi ayrılıyorlar?”: yönlendirici model **false**, uzman **true**. Model notu: Bu soru kısa bir cevapla geçiştirilebiliyor.

### u8 · cevapsiz-teklif (orta) · toplam model 79 / uzman 64
- Soru 4 “Fiyatımız yüksek mi geldi?”: yönlendirici model **false**, uzman **true**. Model notu: Bu soru kısa bir cevapla geçiştirilebiliyor.
- Sonuç: model **5**, uzman **3**. Model yorumu: Tahminin kök nedenle örtüşüyor. · Tahmin: “Asıl öncelikleri sezon kapasitesi ve karar vericiyi tanımıyoruz.”
