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

## 3. Caddy bloğu

`ysfdurak.com` deposunda `sunucu/altyapi/Caddyfile` dosyasına ekle:

```
# Diyalog Atölyesi: doğru soru sorma pratiği + MCP (github.com/ysfdurak/diyalog-atolyesi)
diyalog.ysfdurak.com {
	encode zstd gzip
	reverse_proxy diyalog:8080
}
```

## 4. Sunucuda

```bash
ssh ysf
git clone https://github.com/ysfdurak/diyalog-atolyesi.git ~/diyalog-atolyesi && cd ~/diyalog-atolyesi
cp .env.example .env && nano .env        # ANTHROPIC_API_KEY değerini yapıştır; APP_URL doğru mu bak
cd deploy && sudo docker compose -f docker-compose.ortak.yml up -d --build
cd ~/ysfdurak.com && git pull && cd sunucu/altyapi && sudo docker compose restart caddy
```

## 5. Kontrol

- `https://diyalog.ysfdurak.com/healthz` → `{"ok":true}`
- Ana sayfada sarı "Deneme modu" kutusu **görünmemeli**. Görünüyorsa `.env` içinde `MODEL_MODE=mock` kalmıştır.
- Bir oturum oyna, raporu gör.
- `sudo docker logs diyalog --tail 20` → açılış satırında model adları ve limitler yazar.

## Güncelleme

```bash
cd ~/diyalog-atolyesi && git pull && cd deploy && sudo docker compose -f docker-compose.ortak.yml up -d --build
```

## Sık kullanılanlar

| İş | Komut |
|---|---|
| Kullanım ve tahmini maliyet | `sudo docker exec diyalog node server/istatistik.js` |
| Limitleri değiştir | `.env` içinde `ZIYARETCI_GUNLUK_OTURUM`, `SITE_GUNLUK_OTURUM`; sonra güncelleme komutu |
| Değerlendiriciyi güçlendir | `.env` içinde `DEGERLENDIRICI_MODELI=claude-sonnet-5-5` |
| Geçici olarak kapat | `sudo docker stop diyalog` |

## Yedek

Veritabanında yalnızca günlük sayaçlar ve anonim özetler durur; kaybı kullanıcıyı etkilemez. Bu yüzden gece yedeğine eklenmedi.

## Sorun giderme

- **"Yapay zekâ servisi şu an cevap vermiyor":** `sudo docker logs diyalog --tail 50`. "HTTP 401" anahtar yanlış, "HTTP 400" model adı yanlış ya da bakiye bitmiş, "HTTP 429" Anthropic tarafında hız limiti demektir.
- **Herkes aynı ziyaretçi sayılıyor:** Caddy'nin `X-Forwarded-For` başlığını ilettiğinden emin ol (varsayılan olarak iletir). Cloudflare proxy açıkken `CF-Connecting-IP` kullanılır.
