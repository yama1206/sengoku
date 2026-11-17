"""2.6.5 白い背景の枝葉の写真から背景を抜き、2×2 に並べた1枚の絵（色と透明度）にする（Python の標準機能だけ）。
使い方: python tools/cutout.py 出力の名前 --anchor top|bottom|center 画像1.png [画像2.png ...（4枚まで）] [--size 1024]
・出力の名前_c.png（色。透明な所は葉の色で埋める）と 出力の名前_a.png（透明度。白＝葉）を作る。既にあれば作らない。
・--anchor は枝の付け根を枡のどこに寄せるか（杉の垂れた枝は top、松の房は bottom、広葉樹のかたまりは center）。
・4枚に満たない時は、前の絵を左右反転して埋める。
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from seamless import read_png, write_png


def cut(path):
    W, H, ch = read_png(path)
    mn = [[min(ch[0][y][x], ch[1][y][x], ch[2][y][x]) for x in range(W)] for y in range(H)]
    border = sorted([mn[y][x] for y in (0, 1, H - 2, H - 1) for x in range(0, W, 4)] + [mn[y][x] for x in (0, 1, W - 2, W - 1) for y in range(0, H, 4)])
    b = border[len(border) // 2]  # 背景の明るさ
    bg = [sorted(ch[k][y][x] for y in (0, H - 1) for x in range(0, W, 8))[W // 16] for k in range(3)]
    a = [[min(1.0, max(0.0, (b - 7 - mn[y][x]) / 38.0)) for x in range(W)] for y in range(H)]
    for y in range(H):  # 背景の白を混ぜた分を取り除く
        for x in range(W):
            q = a[y][x]
            if q > 0.04:
                for k in range(3): ch[k][y][x] = min(255.0, max(0.0, (ch[k][y][x] - (1 - q) * bg[k]) / q))
    ys = [y for y in range(H) if max(a[y]) > 0.1]; xs = [x for x in range(W) if any(a[y][x] > 0.1 for y in range(0, H, 2))]
    x0, x1, y0, y1 = max(0, xs[0] - 6), min(W, xs[-1] + 7), max(0, ys[0] - 6), min(H, ys[-1] + 7)
    return x1 - x0, y1 - y0, [[r[x0:x1] for r in c[y0:y1]] for c in ch], [r[x0:x1] for r in a[y0:y1]]


def fit(w, h, ch, a, S, anchor, flip):
    """枡（S×S）に縦横比を保って入れる。色は透明度を掛けて縮める（縁に白がにじまない）"""
    k = min((S - 8) / w, (S - 8) / h); tw, th = max(1, int(w * k)), max(1, int(h * k))
    ox = (S - tw) // 2; oy = 4 if anchor == "top" else S - 4 - th if anchor == "bottom" else (S - th) // 2
    oc = [[[0.0] * S for _ in range(S)] for _ in range(3)]; oa = [[0.0] * S for _ in range(S)]
    for ty in range(th):
        sy0, sy1 = ty / k, (ty + 1) / k
        for tx in range(tw):
            sx0, sx1 = tx / k, (tx + 1) / k; acc = [0.0, 0.0, 0.0]; aa = 0.0; n = 0
            for sy in range(int(sy0), min(h, max(int(sy0) + 1, int(math.ceil(sy1))))):
                for sx in range(int(sx0), min(w, max(int(sx0) + 1, int(math.ceil(sx1))))):
                    q = a[sy][sx]; aa += q; n += 1
                    for c in range(3): acc[c] += ch[c][sy][sx] * q
            X = ox + (tw - 1 - tx if flip else tx); Y = oy + ty
            oa[Y][X] = aa / max(1, n)
            for c in range(3): oc[c][Y][X] = acc[c] / aa if aa > 1e-4 else 0.0
    return oc, oa


def fill(oc, oa, S):
    """透明な所の色を、近くの葉の色で埋める（遠くで縮んだ時に縁が白や黒にならない）"""
    tot = [0.0, 0.0, 0.0]; n = 0
    for y in range(S):
        for x in range(S):
            if oa[y][x] > 0.5:
                n += 1
                for c in range(3): tot[c] += oc[c][y][x]
    mean = [t / max(1, n) for t in tot]
    known = [[oa[y][x] > 0.85 for x in range(S)] for y in range(S)]  # 縁（半透明）の色も内側の葉の色で塗り直す
    for _ in range(24):
        nk = [row[:] for row in known]
        for y in range(S):
            for x in range(S):
                if known[y][x]: continue
                s = [0.0, 0.0, 0.0]; m = 0
                for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < S and 0 <= xx < S and known[yy][xx]:
                        m += 1
                        for c in range(3): s[c] += oc[c][yy][xx]
                if m:
                    for c in range(3): oc[c][y][x] = s[c] / m
                    nk[y][x] = True
        known = nk
    for y in range(S):
        for x in range(S):
            if not known[y][x]:
                for c in range(3): oc[c][y][x] = mean[c]


def main():
    a = sys.argv[1:]; size, anchor = 1024, "center"
    if "--size" in a: i = a.index("--size"); size = int(a[i + 1]); del a[i:i + 2]
    if "--anchor" in a: i = a.index("--anchor"); anchor = a[i + 1]; del a[i:i + 2]
    name, srcs = a[0], a[1:5]
    dc, da = name + "_c.png", name + "_a.png"
    for d in (dc, da):
        if os.path.exists(d): sys.exit("already exists (not overwriting): " + d)
    S = size // 2; C = [[[0.0] * size for _ in range(size)] for _ in range(3)]; A = [[0.0] * size for _ in range(size)]
    cells = []
    for i in range(4):
        src = srcs[i] if i < len(srcs) else srcs[i % len(srcs)]
        w, h, ch, al = cut(src); oc, oa = fit(w, h, ch, al, S, anchor, i >= len(srcs)); fill(oc, oa, S); cells.append((oc, oa))
        print("cell", i, os.path.basename(src), w, "x", h, flush=True)
    for i, (oc, oa) in enumerate(cells):
        ox, oy = (i % 2) * S, (i // 2) * S
        for y in range(S):
            A[oy + y][ox:ox + S] = oa[y]
            for c in range(3): C[c][oy + y][ox:ox + S] = oc[c][y]
    write_png(dc, size, size, C)
    write_png(da, size, size, [[[v * 255 for v in r] for r in A]] * 3)
    print("made:", dc, da)


if __name__ == "__main__":
    main()
