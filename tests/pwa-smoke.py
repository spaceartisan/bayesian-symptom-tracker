from pathlib import Path
import json
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'manifest.webmanifest').read_text(encoding='utf-8'))

assert manifest['id']=='./'
assert manifest['start_url']=='./'
assert manifest['scope']=='./'
assert manifest['display']=='standalone'
assert manifest['theme_color']=='#0d1726'

icons={i['src']:i for i in manifest['icons']}
for src,size in [('./icons/icon-192.png',(192,192)),('./icons/icon-512.png',(512,512)),('./icons/icon-maskable-512.png',(512,512))]:
    assert src in icons, src
    p=ROOT/src.removeprefix('./')
    assert p.exists(), p
    with Image.open(p) as im:
        assert im.size==size,(p,im.size,size)
assert icons['./icons/icon-maskable-512.png']['purpose']=='maskable'

for rel,size in [('icons/apple-touch-icon.png',(180,180)),('icons/favicon-32.png',(32,32))]:
    with Image.open(ROOT/rel) as im:
        assert im.size==size,(rel,im.size,size)

index=(ROOT/'index.html').read_text(encoding='utf-8')
for needle in ['rel="manifest"','apple-touch-icon','mobile-web-app-capable','apple-mobile-web-app-capable','theme-color']:
    assert needle in index,needle

sw=(ROOT/'service-worker.js').read_text(encoding='utf-8')
for needle in ['bst-v10-3','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png']:
    assert needle in sw,needle

app=(ROOT/'app.js').read_text(encoding='utf-8')
for needle in ["APP_VERSION = '0.10.3'",'beforeinstallprompt','appinstalled','renderInstallCard','data-install-app']:
    assert needle in app,needle

print('PASS v0.10.3 PWA manifest, icons, install hooks, and offline shell')
