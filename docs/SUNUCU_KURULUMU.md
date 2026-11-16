# Sunucu kurulumu: diyalog.ysfdurak.com

Diyalog Atölyesi, ysfdurak.com ortak altyapısında (Docker + ortak Caddy) çalışır. Pusula ve Destek Merkezi ile aynı düzen.

```
Cloudflare (turuncu bulut, Full strict) ─▶ ortak Caddy ─(web ağı)─▶ diyalog:8080 ─▶ SQLite /data (yalnızca sayaçlar)
                                                                        └─▶ Anthropic API
```

## 1. Anthropic API anahtarı

1. [console.anthropic.com](https://console.anthropic.com) → hesap aç, ödeme yöntemi ekle ve küçük bir bakiye yükle (ör. 5 $).
2. **Limits** bölümünde **aylık harcama limiti** koy (ör. 10 $). Bu, maliyetin kesin üst sınırıdır.
3. **API Keys → Create Key**. Anahtarı kopyala; bir daha gösterilmez. Kimseyle paylaşma, GitHub'a koyma.

## 2. Cloudflare DNS

Cloudflare → `ysfdurak.com` → **DNS** → **Kayıt ekle**: `A` · ad `diyalog` · içerik SUNUCU_IP · **Proxied (turuncu bulut)**.

## 3. Sunucuda tek komut

Caddy bloğu ve kurulum betiği `ysfdurak.com` deposundadır (`sunucu/altyapi/Caddyfile`, `sunucu/kurulum-diyalog.sh`).

```bash
ssh ysf
cd ~/ysfdurak.com && git pull && bash sunucu/kurulum-diyalog.sh
```

Betik API anahtarını sorar (yazarken görünmez), `.env` dosyasını yalnızca senin okuyabileceğin şekilde oluşturur, uygulamayı derleyip başlatır ve Caddy'yi yeniden yükler.

## 4. Kontrol

- `https://diyalog.ysfdurak.com/healthz` → `{"ok":true}`
- Ana sayfada sarı "Deneme modu" kutusu **görünmemeli**. Görünüyorsa `.env` içinde `MODEL_MODE=mock` kalmıştır.
- Bir oturum oyna, raporu gör.
- `sudo docker logs diyalog --tail 20` → açılış satırında model adları ve limitler yazar.

## Güncelleme

```bash
bash ~/ysfdurak.com/sunucu/kurulum-diyalog.sh
```

## Sık kullanılanlar

| İş | Komut |
|---|---|
| Kullanım ve tahmini maliyet | `sudo docker exec diyalog node server/istatistik.js` |
| Limitleri değiştir | `.env` içinde `ZIYARETCI_GUNLUK_OTURUM`, `SITE_GUNLUK_OTURUM`; sonra güncelleme komutu (`.env` dosyası: `~/diyalog-atolyesi/.env`) |
| Değerlendiriciyi güçlendir | `.env` içinde `DEGERLENDIRICI_MODELI=claude-sonnet-5-5` |
| Kalan krediyi gör | `sudo docker exec diyalog node server/istatistik.js` → `kredi` alanı |
| Geçici olarak kapat | `sudo docker stop diyalog` |

## Kredi yükledikten sonra

`~/diyalog-atolyesi/.env` içinde iki satırı güncelle, sonra güncelleme komutunu çalıştır:

```
KREDI_USD=5                  # yeni yüklediğin tutar + önceki tahmini kalan
KREDI_BASLANGIC=2026-12-20   # yükleme tarihi
```

Kredi bittiği için kapanmış oturumlar, yüklemeden sonra en geç 30 dakikada kendiliğinden açılır.

## Bildirimler (ntfy)

1. Telefona **ntfy** uygulamasını kur (App Store / Google Play).
2. Kurulum betiğinin sonunda yazan adresteki konu adına abone ol. Adres `.env` içinde `BILDIRIM_URL` satırında da durur.
3. Denemek için sunucuda: `curl -d "Deneme bildirimi" "$(grep ^BILDIRIM_URL ~/diyalog-atolyesi/.env | cut -d= -f2)"`

## Yedek

Veritabanında yalnızca günlük sayaçlar ve anonim özetler durur; kaybı kullanıcıyı etkilemez. Bu yüzden gece yedeğine eklenmedi.

## Sorun giderme

- **"Yapay zekâ servisi şu an cevap vermiyor":** `sudo docker logs diyalog --tail 50`. "HTTP 401" anahtar yanlış, "HTTP 400" model adı yanlış ya da bakiye bitmiş, "HTTP 429" Anthropic tarafında hız limiti demektir.
- **Herkes aynı ziyaretçi sayılıyor:** Caddy'nin `X-Forwarded-For` başlığını ilettiğinden emin ol (varsayılan olarak iletir). Cloudflare proxy açıkken `CF-Connecting-IP` kullanılır.
