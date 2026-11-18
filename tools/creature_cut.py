"""2.19.0 魚・虫の絵（白い背景）から背景を抜いて、小さな WebP（透明つき）にする。
ComfyUI の Python（numpy・Pillow が入っている）で動かす:
  "%LOCALAPPDATA%\\Comfy-Desktop\\ComfyUI-Installs\\ComfyUI\\ComfyUI\\.venv\\Scripts\\python.exe" tools/creature_cut.py 元.png 出力.webp [--size 256]
・外の背景（白や生成り。ふちの色から決める）とつながった所だけを抜く（目の光や白い模様は残る）。縁は背景の色を混ぜた分を取り除いてなめらかに
・余白を切って、長い方の辺を --size にそろえる。出力が既にあれば作らない
"""
import sys, os
import numpy as np
from PIL import Image, ImageDraw


def cut(src, size=256):
    im = Image.open(src).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    H, W = a.shape[:2]
    # 背景は白〜生成りで、ふちほど少し暗いぼかしがある。「明るくて色の薄い所」を候補にして、ふちから塗りつぶす
    edge = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    bg = np.median(edge, axis=0)
    mn, mx = a.min(axis=2), a.max(axis=2)
    cand = (mn > 180) & (mx - mn < 45)
    # 候補を 255、ほかを 0 にして、ふちから塗りつぶす → 外の背景だけが 128 になる
    # 絵の線のすき間から体の中（白い腹など）へ塗りつぶしが入らないよう、絵の側を 3px 太らせてから塗る
    obj = ~cand
    for _ in range(3):
        obj = obj | np.roll(obj, 1, 0) | np.roll(obj, -1, 0) | np.roll(obj, 1, 1) | np.roll(obj, -1, 1)
    cand = ~obj
    m = Image.fromarray(np.where(cand, 255, 0).astype(np.uint8)).copy()  # copy しないと numpy と共有で塗りつぶしが効かない
    # 抜き具合（縁を半透明にする量）は、その場所の背景らしさ：明るさで決める
    dist = np.clip(235 - mn, 0, 255) + np.clip((mx - mn) - 30, 0, 255)
    for x in range(0, W, 8):
        for y in (0, H - 1):
            if m.getpixel((x, y)) == 255: ImageDraw.floodfill(m, (x, y), 128)
    for y in range(0, H, 8):
        for x in (0, W - 1):
            if m.getpixel((x, y)) == 255: ImageDraw.floodfill(m, (x, y), 128)
    out = np.asarray(m) == 128
    # 外の背景のまわり 4px は、明るさで半透明に（太らせた分と縁をなめらかに）
    band = out.copy()
    for _ in range(4):
        band = band | np.roll(band, 1, 0) | np.roll(band, -1, 0) | np.roll(band, 1, 1) | np.roll(band, -1, 1)
    al = np.ones_like(mn)
    al[band] = np.clip((dist[band] + 10) / 50, 0, 1)
    al[out] = 0
    # 背景の色を混ぜた分を取り除く
    k = np.maximum(al, 1e-3)[..., None]
    rgb = np.clip((a - (1 - k) * bg) / k, 0, 255)
    ys, xs = np.nonzero(al > 0.05)
    if len(xs) == 0:
        raise SystemExit("絵が見つからない: " + src)
    pad = 6
    x0, x1, y0, y1 = max(0, xs.min() - pad), min(W, xs.max() + pad + 1), max(0, ys.min() - pad), min(H, ys.max() + pad + 1)
    rgba = np.dstack([rgb, al * 255])[y0:y1, x0:x1].astype(np.uint8)
    img = Image.fromarray(rgba, "RGBA")
    s = size / max(img.size)
    img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
    return img


def main():
    a = sys.argv[1:]
    size = 256
    if "--size" in a: i = a.index("--size"); size = int(a[i + 1]); del a[i:i + 2]
    src, dst = a[0], a[1]
    if os.path.exists(dst): sys.exit("あるので作らない: " + dst)
    img = cut(src, size)
    img.save(dst, "WEBP", quality=82, method=6)
    print("made:", dst, img.size, os.path.getsize(dst) // 1024, "KB")


if __name__ == "__main__":
    main()
