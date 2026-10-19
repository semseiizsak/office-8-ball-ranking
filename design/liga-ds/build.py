"""Inlines parts/*.html into index.html between <!-- PART:x --> markers. Run after editing a part."""
import re, pathlib
root = pathlib.Path(__file__).parent
idx = root / 'index.html'
s = idx.read_text()
GROUPS = {'data': 'Data and charts', 'social': 'Community and media', 'forms': 'More inputs and controls', 'system': 'System and account', 'motion': None, 'screens-tabs': 'Screens', 'screens-flows': 'Flows', 'screens-detail': 'Detail screens', 'screens-kiosk': 'Kiosk tablet', 'ios': 'iOS surfaces', 'game': 'Gamification', 'nav': 'Navigation patterns', 'schedule': 'Scheduling and queue', 'onboard': 'Onboarding and plans'}
for name, title in GROUPS.items():
    fp = root / 'parts' / f'{name}.html'
    if not fp.exists():
        continue
    body = fp.read_text().strip()
    head = f'<h2 class="group" data-group>{title}</h2>\n' if title else ''
    block = f'<!-- PART:{name} -->\n{head}{body}\n<!-- /PART:{name} -->'
    pat = re.compile(rf'<!-- PART:{name} -->.*?<!-- /PART:{name} -->', re.S)
    if pat.search(s):
        s = pat.sub(lambda m: block, s)
    else:
        s = s.replace('<!-- ================= PATTERNS', block + '\n\n<!-- ================= PATTERNS', 1)
    if f'parts/{name}.css' not in s:
        s = s.replace('<link rel="stylesheet" href="page.css', f'<link rel="stylesheet" href="parts/{name}.css">\n<link rel="stylesheet" href="page.css', 1)
    if (root / 'parts' / f'{name}.js').exists() and f'parts/{name}.js' not in s:
        s = re.sub(r'(<script src="page\.js[^"]*"></script>)', lambda m: m.group(1) + f'\n<script src="parts/{name}.js"></script>', s, count=1)
import time
# keep thousands together: '1 248' never wraps (only in text, not in tags or scripts)
def nbsp(html):
    parts = re.split(r'(<script[\s\S]*?</script>|<style[\s\S]*?</style>|<[^>]+>)', html)
    return ''.join(p if p.startswith('<') else re.sub(r'(?<=\d) (?=\d{3}(?!\d))', '\u00a0', p) for p in parts)
s = nbsp(s)
v = str(int(time.time()))
s = re.sub(r'((?:href|src)="(?:page|tokens|components|parts/[\w-]+)\.(?:css|js))(?:\?v=\d+)?"', lambda m: f'{m.group(1)}?v={v}"', s)
idx.write_text(s)
print('ok', len(s))
