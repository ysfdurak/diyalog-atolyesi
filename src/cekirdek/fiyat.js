// Model liste fiyatları: milyon token başına ABD doları [girdi, çıktı].
// Kaynak: platform.claude.com/docs/en/about-claude/pricing (Kasım 2026). Fiyat ya da model değişirse burayı güncelle.
// Buradaki hesap TAHMİNDİR; kesin tutar Anthropic Console'daki faturadır.
export const FIYAT = { 'claude-haiku-5-5': [0.1, 0.5], 'claude-sonnet-5-5': [2, 10], 'claude-opus-5-5': [4, 20] };

/** Tek satırın (model, girdi token, çıktı token) tahmini tutarı; fiyatı bilinmeyen model için null. */
export function satirUsd(k) {
  const f = FIYAT[k.model];
  return f ? (k.girdi * f[0] + k.cikti * f[1]) / 1e6 : null;
}

/** Kullanım satırlarının tahmini toplamı (fiyatı bilinmeyen modeller sayılmaz). */
export const tahminiUsd = (satirlar) => satirlar.reduce((t, k) => t + (satirUsd(k) || 0), 0);
