import sys
from playwright.sync_api import sync_playwright
svg = open(sys.argv[1]).read(); out = sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch()
    for size, name, square in [(32,"favicon-32.png",False),(180,"apple-touch-icon.png",True),(512,"logo-512.png",False),(120,"oauth-logo-120.png",True)]:
        pg = b.new_page(viewport={"width": size, "height": size})
        s = svg
        if square: s = s.replace('rx="16"', 'rx="0"')
        pg.set_content(f'<html><body style="margin:0;background:transparent">{s.replace("<svg ", f"<svg width=\'{size}\' height=\'{size}\' ")}</body></html>')
        pg.screenshot(path=f"{out}/{name}", omit_background=True)
    b.close()
