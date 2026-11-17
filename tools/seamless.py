"""1.6.74 写真をつなぎ目の無いタイル画像にする（Python の標準機能だけで動く。Pillow 不要）。
使い方: python tools/seamless.py 入力.png 出力.png [--size 1024] [--flat 0.8] [--band 0.14] [--preview 見本.png]
・--flat  大きな明るさのむら（片側が明るい等）を消す強さ（0〜1）。繰り返しが目立たなくなる
・--band  境目をなじませる帯の幅（画像の幅に対する割合）
・右端の帯を左端の帯に重ねて混ぜ、その分だけ短く切ると、左右の端がつながる（上下も同じ）。
  最後に --size の大きさに直す。半分ずらして混ぜるやり方と違い、同じ石や草が1枚の中に二度出ない。
  混ぜる所でぼやけて薄くならないよう、明るさのばらつきを保つ混ぜ方にする。
・出力ファイルが既にある時は作らない（上書きしない）。
"""
import sys, os, zlib, struct, math


def read_png(path):
    d = open(path, "rb").read()
    assert d[:8] == b"\x89PNG\r\n\x1a\n", "PNG ではありません"
    i, idat, W = 8, b"", 0
    while i < len(d):
        n, t = struct.unpack(">I4s", d[i:i + 8]); c = d[i + 8:i + 8 + n]; i += 12 + n
        if t == b"IHDR":
            W, H, bd, ct, _, _, il = struct.unpack(">IIBBBBB", c)
            assert bd == 8 and ct in (2, 6) and il == 0, "8bit の RGB / RGBA だけ読めます"
            bpp = 3 if ct == 2 else 4
        elif t == b"IDAT":
            idat += c
    raw, st = zlib.decompress(idat), W * bpp
    prev, rows, p = bytearray(st), [], 0
    for y in range(H):
        f = raw[p]; line = bytearray(raw[p + 1:p + 1 + st]); p += 1 + st
        if f == 1:
            for x in range(bpp, st): line[x] = (line[x] + line[x - bpp]) & 255
        elif f == 2:
            for x in range(st): line[x] = (line[x] + prev[x]) & 255
        elif f == 3:
            for x in range(st): line[x] = (line[x] + ((line[x - bpp] if x >= bpp else 0) + prev[x]) // 2) & 255
        elif f == 4:
            for x in range(st):
                a = line[x - bpp] if x >= bpp else 0; b = prev[x]; c = prev[x - bpp] if x >= bpp else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line); prev = line
    # チャンネルごとの float 配列（行ごと）にする
    ch = [[[float(r[x * bpp + k]) for x in range(W)] for r in rows] for k in range(3)]
    return W, H, ch


def write_png(path, W, H, ch):
    out = bytearray()
    for y in range(H):
        out.append(0)
        r, g, b = ch[0][y], ch[1][y], ch[2][y]
        for x in range(W):
            out += bytes((min(255, max(0, int(r[x] + 0.5))), min(255, max(0, int(g[x] + 0.5))), min(255, max(0, int(b[x] + 0.5)))))
    def chunk(t, c): return struct.pack(">I", len(c)) + t + c + struct.pack(">I", zlib.crc32(t + c) & 0xffffffff)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(out), 9)) + chunk(b"IEND", b"")
    with open(path, "xb") as f:
        f.write(data)


def smooth(e0, e1, v):
    t = min(1.0, max(0.0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t)


def flatten(W, H, ch, k):
    """大きな明るさのむらを消す：粗く縮めた画像を回り込みでぼかし、元の画像をその分だけ割る"""
    if k <= 0: return
    S = 16; w, h = W // S, H // S
    for c in ch:
        mean = sum(map(sum, c)) / (W * H)
        sm = [[sum(c[y * S + j][x * S + i] for j in range(0, S, 4) for i in range(0, S, 4)) / ((S // 4) ** 2) for x in range(w)] for y in range(h)]
        R = max(2, w // 6)
        for _ in range(3):  # 箱ぼかし3回 ≒ ぼかし（端は反対側に回り込む）
            sm = [[sum(sm[y][(x + d) % w] for d in range(-R, R + 1)) / (2 * R + 1) for x in range(w)] for y in range(h)]
            sm = [[sum(sm[(y + d) % h][x] for d in range(-R, R + 1)) / (2 * R + 1) for x in range(w)] for y in range(h)]
        for y in range(H):
            fy = y / S - 0.5; y0 = math.floor(fy); ty = fy - y0; ra, rb = sm[y0 % h], sm[(y0 + 1) % h]; row = c[y]
            for x in range(W):
                fx = x / S - 0.5; x0 = math.floor(fx); tx = fx - x0; x1 = (x0 + 1) % w; x0 %= w
                v = (ra[x0] * (1 - tx) + ra[x1] * tx) * (1 - ty) + (rb[x0] * (1 - tx) + rb[x1] * tx) * ty
                row[x] *= (mean / max(1.0, v)) ** k


def crop_blend(W, H, ch, band, axis):
    """axis=0 で左右、1 で上下の端をつなぐ。終わりの帯（幅 b）を始めの帯に重ねて混ぜ、その分だけ短く切る。
    中身は二重にならない（混ぜる帯の所だけ2枚が重なる）"""
    N = W if axis == 0 else H; b = max(8, int(N * band)); L = N - b
    t = [smooth(0.0, 1.0, (i + 0.5) / b) for i in range(b)]  # 0：終わりの帯の続き → 1：始めの帯
    nm = [1.0 / math.sqrt(a * a + (1 - a) * (1 - a)) for a in t]
    for c in ch:
        mean = sum(map(sum, c)) / (W * H)
        if axis == 0:
            for y in range(H):
                r = c[y]; row = r[:L]
                for i in range(b): row[i] = mean + (t[i] * (r[i] - mean) + (1 - t[i]) * (r[L + i] - mean)) * nm[i]
                c[y] = row
        else:
            for i in range(b):
                a, e = c[i], c[L + i]
                c[i] = [mean + (t[i] * (a[x] - mean) + (1 - t[i]) * (e[x] - mean)) * nm[i] for x in range(W)]
            del c[L:]
    return (L, H) if axis == 0 else (W, L)


def resize(W, H, ch, size):
    """なめらかに大きさを変える（端は反対側に回り込む）"""
    out = []
    for c in ch:
        o = []
        for y in range(size):
            fy = (y + 0.5) * H / size - 0.5; y0 = math.floor(fy); ty = fy - y0; ra, rb = c[y0 % H], c[(y0 + 1) % H]; row = []
            for x in range(size):
                fx = (x + 0.5) * W / size - 0.5; x0 = math.floor(fx); tx = fx - x0; x1 = (x0 + 1) % W; x0 %= W
                row.append((ra[x0] * (1 - tx) + ra[x1] * tx) * (1 - ty) + (rb[x0] * (1 - tx) + rb[x1] * tx) * ty)
            o.append(row)
        out.append(o)
    return size, size, out


def shrink(W, H, ch, size):
    f = W // size
    if f <= 1: return W, H, ch
    w, h = W // f, H // f; q = f * f
    return w, h, [[[sum(c[y * f + j][x * f + i] for j in range(f) for i in range(f)) / q for x in range(w)] for y in range(h)] for c in ch]


def main():
    a = sys.argv[1:]
    opt = {"--size": 1024, "--flat": 0.8, "--band": 0.14, "--preview": None}
    for k in list(opt):
        if k in a:
            i = a.index(k); v = a[i + 1]; opt[k] = v if k == "--preview" else type(opt[k])(v); del a[i:i + 2]
    src, dst = a
    if os.path.exists(dst): sys.exit("出力が既にあります（上書きしません）: " + dst)
    W, H, ch = read_png(src)
    flatten(W, H, ch, opt["--flat"])
    W, H = crop_blend(W, H, ch, opt["--band"], 0)
    W, H = crop_blend(W, H, ch, opt["--band"], 1)
    W, H, ch = resize(W, H, ch, opt["--size"])
    write_png(dst, W, H, ch)
    print("作成:", dst, W, "x", H)
    if opt["--preview"]:  # 3×3 に並べた見本（つなぎ目の確認用）
        tw, th, tc = shrink(W, H, ch, max(1, W // 2)) if W > 400 else (W, H, ch)
        big = [[tc[k][y % th] * 3 for y in range(th * 3)] for k in range(3)]
        write_png(opt["--preview"], tw * 3, th * 3, big)
        print("見本:", opt["--preview"])


if __name__ == "__main__":
    main()
