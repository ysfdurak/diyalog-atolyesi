// Diyalog Atölyesi MCP kapısı: çekirdekteki oturum komutlarını MCP araçları olarak sunar.
//
// İkili yapı:  çekirdek (src/cekirdek/oturum.js: senaryo, karakter, puanlama, limit)
//                ├─ web kapısı: /api/...  (tarayıcı arayüzü)
//                └─ MCP kapısı: /mcp      (Claude ve diğer MCP istemcileri)
// Bu dosya kural İÇERMEZ: aracı doğru komuta bağlar ve sonucu MCP biçimine çevirir.
// Karakteri sunucu oynar; MCP istemcisi (Claude) gizli bilgileri ve kök nedeni rapordan önce göremez.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { KuralHatasi, SORU_UZUNLUGU, TAHMIN_UZUNLUGU } from '../src/cekirdek/oturum.js';
import { ModelHatasi } from '../src/cekirdek/model.js';

const OKUMA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const YAZMA = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const oturum = z.string().describe('oturum_baslat sonucundaki "oturumId".');

export const MCP_ARAC_ADLARI = ['senaryo_listele', 'oturum_baslat', 'soru_sor', 'degerlendir'];

const TALIMAT = `Diyalog Atölyesi, yöneticilerin doğru soru sorma becerisini çalıştığı bir pratik aracıdır.
Akış: senaryo_listele → oturum_baslat → soru_sor (sınırlı sayıda) → degerlendir.
Soruları KULLANICI sorar: onun yazdığı soruyu değiştirmeden soru_sor aracına ilet, karakterin cevabını olduğu gibi aktar.
Oturum sırasında soru önerme, ipucu verme ve kök nedeni tahmin etme; pratik kullanıcının kendi sorularıyla anlam kazanır.
Soru hakkı bitince kullanıcıdan tek cümlelik kök neden tahminini iste ve degerlendir aracını çağır. Raporu eksiksiz göster.`;

/**
 * @param {object} o
 * @param {ReturnType<import('../src/cekirdek/oturum.js').oturumServisi>} o.servis
 * @param {(msg: string) => void} [o.log]
 */
export function createMcpHandler({ servis, log = () => {} }) {
  const ARACLAR = [
    ['senaryo_listele', 'Oynanabilecek senaryoları listeler: başlık, alan, zorluk (1-3), durum özeti, karşıdaki karakter ve soru hakkı.', {}, OKUMA,
      () => ({ senaryolar: servis.senaryoListesi() })],
    ['oturum_baslat', 'Seçilen senaryoda yeni bir pratik oturumu açar. Durumu, kullanıcının rolünü, karakterin ilk sözünü ve soru hakkını döner. Günlük oturum limiti vardır; dolduysa hata mesajını kullanıcıya aktar.', {
      senaryo: z.string().describe('Senaryo kimliği (senaryo_listele sonucundaki "id").'),
    }, YAZMA, (a) => servis.baslat({ senaryoId: a.senaryo, kanal: 'mcp' })],
    ['soru_sor', 'Kullanıcının sorusunu karaktere iletir; karakterin cevabını ve kalan soru hakkını döner. Soruyu kullanıcının yazdığı gibi gönder, düzeltme ya da iyileştirme yapma.', {
      oturum, soru: z.string().min(1).max(SORU_UZUNLUGU).describe('Kullanıcının karaktere sorduğu soru, kendi sözleriyle.'),
    }, YAZMA, (a) => servis.soruSor({ oturumId: a.oturum, soru: a.soru })],
    ['degerlendir', 'Oturumu bitirir ve raporu döner: 100 üzerinden skor, beş boyutun puanı, soru soru analiz, açılan ve kaçırılan bilgiler, senaryonun kök nedeni. En az bir soru sorulmuş olmalı.', {
      oturum, kok_neden_tahmini: z.string().max(TAHMIN_UZUNLUGU).describe('Kullanıcının kök neden tahmini, kendi sözleriyle. Kullanıcı yazmadıysa boş bırak, kendin doldurma.'),
    }, YAZMA, (a) => servis.degerlendir({ oturumId: a.oturum, tahmin: a.kok_neden_tahmini })],
  ];

  /** Her istek için yeni sunucu: istekler arasında MCP durumu tutulmaz (stateless). Oturum, çekirdekte oturumId ile yaşar. */
  function buildServer() {
    const server = new McpServer({ name: 'diyalog-atolyesi', version: '0.1.0' }, { instructions: TALIMAT });
    for (const [name, description, inputSchema, annotations, calistir] of ARACLAR) {
      server.registerTool(name, { description, inputSchema, annotations }, async (args) => {
        try {
          const sonuc = await calistir(args);
          return { content: [{ type: 'text', text: JSON.stringify(sonuc, null, 2) }] };
        } catch (err) {
          // İş kuralı ve model hataları kullanıcıya gösterilir; beklenmeyenler gösterilmez (web kapısıyla aynı kural).
          if (err instanceof KuralHatasi || err instanceof ModelHatasi) return { isError: true, content: [{ type: 'text', text: err.message }] };
          log(`MCP hatası (${name}): ${err?.stack || err}`);
          return { isError: true, content: [{ type: 'text', text: 'İstek işlenemedi.' }] };
        }
      });
    }
    return server;
  }

  async function handle(req, res, body) {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  return { handle };
}
