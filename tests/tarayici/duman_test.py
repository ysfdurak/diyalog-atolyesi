"""Diyalog tarayıcı duman testi (sahte model, yapay zekâ çağrısı yok): ana sayfa açılır, bir senaryo başlar,
ilk soruda veri notu ve gizlilik bağlantısı görünür, soru gönderilince karakter cevap verir, gizlilik sayfası açılır.
Çalıştırma: python3 tests/tarayici/duman_test.py [chrome-yolu]   (gerekenler: pip install playwright; Node.js)"""
import os, socket, subprocess, sys, tempfile, time
from playwright.sync_api import sync_playwright

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CHROME = sys.argv[1] if len(sys.argv) > 1 else None
s = socket.socket(); s.bind(('127.0.0.1', 0)); PORT = s.getsockname()[1]; s.close()
URL = f'http://127.0.0.1:{PORT}/'
env = dict(os.environ, PORT=str(PORT), HOST='127.0.0.1', MODEL_MODE='mock', APP_URL=URL, DATA_DIR=tempfile.mkdtemp())
sunucu = subprocess.Popen(['node', 'server/index.js'], cwd=REPO, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
sonuc = []
def ok(ad, kosul): sonuc.append(bool(kosul)); print(('✓' if kosul else '✗'), ad)
try:
    for _ in range(50):
        try: socket.create_connection(('127.0.0.1', PORT), timeout=0.2).close(); break
        except OSError: time.sleep(0.2)
    with sync_playwright() as p:
        b = p.chromium.launch(**({'executable_path': CHROME} if CHROME else {}))
        pg = b.new_page(locale='tr-TR'); hatalar = []; pg.on('pageerror', lambda e: hatalar.append(str(e)))
        pg.goto(URL); pg.wait_for_timeout(1500)
        pg.get_by_role('button', name='Başla').first.click(); pg.wait_for_timeout(1500)
        ok('soru alanı açıldı', pg.locator('#soru').count() == 1)
        ok('veri notu ve gizlilik bağlantısı var', pg.locator('#veri-notu a[href="/gizlilik.html"]').count() == 1)
        onceki = pg.locator('main').inner_text()
        pg.fill('#soru', 'Bu sorunu ilk ne zaman fark ettin, o gün neler oldu?')
        pg.locator('button[type=submit]').first.click(); pg.wait_for_timeout(2000)
        ok('karakter cevap verdi', len(pg.locator('main').inner_text()) > len(onceki))
        # Rapor: her boyutta "Neden bu puan?" dayanağı; yönlendirici soru kendi metniyle gösterilir.
        pg.fill('#soru', 'Ekip isteksiz mi çalışıyor?')
        pg.locator('button[type=submit]').first.click(); pg.wait_for_timeout(1500)
        pg.get_by_role('button', name='Sorularım bitti').click(); pg.wait_for_timeout(500)
        pg.fill('#tahmin', 'Yeni düzen ekibe anlatılmadı ve kimse eğitim almadı.')
        pg.locator('button[type=submit]').first.click(); pg.wait_for_timeout(2500)
        ok('raporda beş "Neden bu puan?" kutusu', pg.locator('details.dayanak').count() == 5)
        pg.locator('details.dayanak').nth(2).locator('summary').click()
        ok('yönlendirici soru dayanağı kullanıcının kendi sorusu', 'Ekip isteksiz mi çalışıyor?' in pg.locator('details.dayanak').nth(2).inner_text())
        pg.goto(URL + 'gizlilik.html'); pg.wait_for_timeout(500)
        ok('gizlilik sayfası açılıyor', 'Gizlilik ve veri' in pg.locator('h1').inner_text())
        ok('sayfa hatası yok', not hatalar)
        if hatalar: print(hatalar[:3])
        b.close()
finally:
    sunucu.terminate()
print('SONUÇ:', 'hepsi geçti' if all(sonuc) else 'HATA')
sys.exit(0 if all(sonuc) else 1)
