"""2.12.4 白い背景の絵1枚から背景を抜いて、透明度つきの小さな PNG にする（Python の標準機能だけ）。
使い方: python tools/cutone.py 元.png 出力.png --size 大きさ [--keep]
・--size：出力の長い方の辺（px）。絵は余白を切って、縦横比を保って縮める
・--keep：背景を抜かずに縮めるだけ（背景の絵など。出力は透明度なしの PNG）
・出力が既にあれば作らない（上書きしない）
・--person：外の背景とつながった白だけを抜く（2.13.3 白目・瞳の光・白い着物が透けない。人物の絵に使う）
"""
import sys, os, struct, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from seamless import read_png
from cutout import cut
from collections import deque


def cut_person(path):
    """外の背景とつながった明るい所だけを透明にする。線で囲まれた白（白目・瞳の光・白い服）は残す"""
    W, H, ch = read_png(path)
    mn = [[min(ch[0][y][x], ch[1][y][x], ch[2][y][x]) for x in range(W)] for y in range(H)]
    border = sorted([mn[y][x] for y in (0, 1, H - 2, H - 1) for x in range(0, W, 4)] + [mn[y][x] for x in (0, 1, W - 2, W - 1) for y in range(0, H, 4)])
    b = border[len(border) // 2]
    bg = [sorted(ch[k][y][x] for y in (0, H - 1) for x in range(0, W, 8))[W // 16] for k in range(3)]
    a = [[min(1.0, max(0.0, (b - 7 - mn[y][x]) / 38.0)) for x in range(W)] for y in range(H)]
    out = [[False] * W for _ in range(H)]; dq = deque()
    for y in range(H):
        for x in (0, W - 1):
            if a[y][x] < 0.98 and not out[y][x]: out[y][x] = True; dq.append((y, x))
    for x in range(W):
        for y in (0, H - 1):
            if a[y][x] < 0.98 and not out[y][x]: out[y][x] = True; dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= yy < H and 0 <= xx < W and not out[yy][xx] and a[yy][xx] < 0.98:
                out[yy][xx] = True; dq.append((yy, xx))
    for y in range(H):
        for x in range(W):
            if not out[y][x]: a[y][x] = 1.0; continue
            q = a[y][x]
            if q > 0.04:
                for k in range(3): ch[k][y][x] = min(255.0, max(0.0, (ch[k][y][x] - (1 - q) * bg[k]) / q))
    ys = [y for y in range(H) if max(a[y]) > 0.1]; xs = [x for x in range(W) if any(a[y][x] > 0.1 for y in range(0, H, 2))]
    x0, x1, y0, y1 = max(0, xs[0] - 6), min(W, xs[-1] + 7), max(0, ys[0] - 6), min(H, ys[-1] + 7)
    return x1 - x0, y1 - y0, [[r[x0:x1] for r in c[y0:y1]] for c in ch], [r[x0:x1] for r in a[y0:y1]]


def shrink(W, H, ch, a, f):
    """f 分の1に縮める（透明度を掛けて平均。縁に白がにじまない）"""
    w, h = W // f, H // f
    oc = [[[0.0] * w for _ in range(h)] for _ in range(3)]; oa = [[0.0] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            s = [0.0, 0.0, 0.0]; aa = 0.0
            for j in range(f):
                for i in range(f):
                    q = a[y * f + j][x * f + i] if a else 1.0; aa += q
                    for c in range(3): s[c] += ch[c][y * f + j][x * f + i] * q
            oa[y][x] = aa / (f * f)
            for c in range(3): oc[c][y][x] = s[c] / aa if aa > 1e-4 else 0.0
    return w, h, oc, oa


def resize(W, H, ch, a, tw, th):
    """面積で平均して tw×th に縮める"""
    kx, ky = W / tw, H / th
    oc = [[[0.0] * tw for _ in range(th)] for _ in range(3)]; oa = [[0.0] * tw for _ in range(th)]
    for ty in range(th):
        y0, y1 = int(ty * ky), max(int(ty * ky) + 1, int((ty + 1) * ky))
        for tx in range(tw):
            x0, x1 = int(tx * kx), max(int(tx * kx) + 1, int((tx + 1) * kx))
            s = [0.0, 0.0, 0.0]; aa = 0.0; n = 0
            for y in range(y0, min(H, y1)):
                for x in range(x0, min(W, x1)):
                    q = a[y][x]; aa += q; n += 1
                    for c in range(3): s[c] += ch[c][y][x] * q
            oa[ty][tx] = aa / max(1, n)
            for c in range(3): oc[c][ty][tx] = s[c] / aa if aa > 1e-4 else 0.0
    return oc, oa


def write_rgba(path, W, H, ch, a, alpha=True):
    out = bytearray()
    for y in range(H):
        out.append(0)
        for x in range(W):
            px = [min(255, max(0, int(ch[c][y][x] + 0.5))) for c in range(3)]
            if alpha: px.append(min(255, max(0, int(a[y][x] * 255 + 0.5))))
            out += bytes(px)
    def chunk(t, c): return struct.pack(">I", len(c)) + t + c + struct.pack(">I", zlib.crc32(t + c) & 0xffffffff)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 6 if alpha else 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(out), 9)) + chunk(b"IEND", b"")
    with open(path, "xb") as f:
        f.write(data)


def main():
    a = sys.argv[1:]; size, keep = 128, False
    if "--size" in a: i = a.index("--size"); size = int(a[i + 1]); del a[i:i + 2]
    if "--keep" in a: a.remove("--keep"); keep = True
    person = "--person" in a
    if person: a.remove("--person")
    src, dst = a[0], a[1]
    if os.path.exists(dst): sys.exit("already exists (not overwriting): " + dst)
    W, H, ch = read_png(src)
    if keep:
        al = [[1.0] * W for _ in range(H)]
    else:
        W, H, ch, al = (cut_person if person else cut)(src)
    f = max(1, min(W, H) // max(size * 2, 1))  # 先にざっと縮めて速くする
    if f > 1: W, H, ch, al = shrink(W, H, ch, al, f)
    k = size / max(W, H); tw, th = max(1, round(W * k)), max(1, round(H * k))
    oc, oa = resize(W, H, ch, al, tw, th)
    if not keep:  # 透明な所の色は近くの色で埋める（縮めた時に縁が白くならない）
        for _ in range(3):
            for y in range(th):
                for x in range(tw):
                    if oa[y][x] > 0.02: continue
                    s = [0.0, 0.0, 0.0]; n = 0
                    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < th and 0 <= xx < tw and oa[yy][xx] > 0.02:
                            n += 1
                            for c in range(3): s[c] += oc[c][yy][xx]
                    if n:
                        for c in range(3): oc[c][y][x] = s[c] / n
    write_rgba(dst, tw, th, oc, oa, not keep)
    print("made:", dst, tw, "x", th)


if __name__ == "__main__":
    main()
