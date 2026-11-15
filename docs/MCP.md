# MCP kapısı: Diyalog Atölyesi'ni Claude'a bağlamak

Sunucu, web arayüzüne ek olarak bir **MCP (Model Context Protocol) kapısı** sunar: `/mcp`. Claude bu kapıdan senaryoları listeler, oturum açar, senin sorularını karaktere iletir ve raporu getirir.

```
Claude ──(MCP, erişim anahtarı)──▶ /mcp ──▶ server/mcp.js ──▶ oturum servisi (kurallar, puanlama)
Tarayıcı ────────────────────────▶ /api ───────────────────▶ oturum servisi (aynı kurallar)
```

- **Kural tek yerde.** MCP kapısı kural içermez; soru hakkı, uzunluk sınırı ve puanlama web ile aynı koddan çalışır.
- **Karakteri sunucu oynar.** Claude gizli bilgileri ve kök nedeni rapordan önce göremez; bu yüzden sana ipucu veremez.
- **Durumsuz.** Sunucu MCP oturumu tutmaz (yalnızca `POST /mcp`). Pratik oturumu `oturumId` ile yaşar.

## Araçlar

| Araç | Ne yapar |
|---|---|
| `senaryo_listele` | Senaryolar: başlık, alan, zorluk, durum, karakter, soru hakkı |
| `oturum_baslat` | Seçilen senaryoda oturum açar |
| `soru_sor` | Sorunu karaktere iletir; cevabı ve kalan soru hakkını döner |
| `degerlendir` | Oturumu bitirir, raporu döner |

## Açmak

Varsayılan kapalıdır. `.env` içinde:

```bash
MCP_ENABLED=true
MCP_ANAHTARLARI=buraya-64-karakterlik-anahtar     # üretmek için: openssl rand -hex 32
MCP_GUNLUK_OTURUM=10
```

Anahtar zorunludur: MCP oturumları da model çağrısı yapar, yani para harcar. Anahtarsız bir kapı herkese açık bir fatura olurdu. MCP'nin günlük limiti web limitinden ayrı sayılır.

## Claude'a bağlamak

Claude → **Ayarlar → Bağlayıcılar → Özel bağlayıcı ekle**:

- **Ad:** Diyalog Atölyesi
- **Adres:** `https://diyalog.ysfdurak.com/mcp/ANAHTARIN`

Anahtar adresin içinde durur; bu adresi kimseyle paylaşma. `Authorization: Bearer ANAHTARIN` başlığı gönderebilen istemciler (MCP Inspector gibi) adres olarak yalnızca `/mcp` kullanabilir.

Sonra Claude'a şunu yazabilirsin: "Diyalog Atölyesi'nde depo senaryosunu oynayalım."

## Pusula'dan farkı

Pusula'da her kullanıcının kendi verisi olduğu için Claude, Google girişiyle (OAuth) bağlanır. Diyalog Atölyesi'nde hesap yok; kapı tek bir paylaşılmayan anahtarla korunur. Kullanıcı hesabı eklenirse aynı OAuth yapısına geçilir.
