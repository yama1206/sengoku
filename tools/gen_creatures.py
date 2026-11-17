#!/usr/bin/env python3
# 生き物（魚・虫）の元データ tools/creatures.txt から js/data/creatures.js を作る。虫や魚を足すときは creatures.txt の最後に同じ書式で足して、このスクリプトを実行する
# 使い方：python3 tools/gen_creatures.py
import re, json, os
here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, 'creatures.txt'), encoding='utf-8').read()
RG = {'全国': [0, 6], '東北～九州': [0, 6], '東海～九州': [0, 3], '東海～九州など': [0, 3], '東北～近畿': [2, 6], '近畿': [2, 2], '東海・近畿': [2, 3], '東北南部～九州': [0, 5]}
ONLY = {'中国': ['中国']}
blocks = re.split(r'\n\s*\d+\.\s+', '\n' + src)[1:]
out, cnt = [], {'f': 0, 'b': 0}
for b in blocks:
    lines = [l.strip() for l in b.split('\n') if l.strip()]
    name = lines[0]; f = {}
    for l in lines[1:]:
        m = re.match(r'(分類|場所|地方|月|時間|珍しさ|大きさ|値段|取りにくさ)：(.+)', l)
        if m: f[m.group(1)] = m.group(2).strip()
    if '分類' not in f: continue
    k = 'f' if f['分類'] == '魚' else 'b'; cnt[k] += 1
    mo = re.match(r'(\d+)～(\d+)月', f['月']); sz = re.match(r'(\d+)～(\d+)(cm|mm)', f['大きさ'])
    d = {'id': f'{k}{cnt[k]:02d}', 'n': name, 'k': k, 'pl': f['場所'].split('・'), 'rgT': f['地方'], 'm': [int(mo.group(1)), int(mo.group(2))], 't': f['時間'].split('・'), 'r': f['珍しさ'], 'sz': [int(sz.group(1)), int(sz.group(2))], 'p': int(f['値段'].replace(',', '').replace('文', '')), 'd': f['取りにくさ']}
    if f['地方'] in RG: d['rg'] = RG[f['地方']]
    elif f['地方'] in ONLY: d['only'] = ONLY[f['地方']]
    else: raise SystemExit(f'地方が分かりません：{name} {f["地方"]}')
    out.append(d)
js = '// 自動生成（tools/gen_creatures.py。元データは tools/creatures.txt）。手で直さず、元データを直して作り直すこと\n(function () {\n  SGK.DATA.creatures = [\n' + ',\n'.join('    ' + json.dumps(d, ensure_ascii=False, separators=(',', ':')) for d in out) + '\n  ];\n})();\n'
open(os.path.join(here, '..', 'js', 'data', 'creatures.js'), 'w', encoding='utf-8').write(js)
print('魚', cnt['f'], '虫', cnt['b'])
