"""2.68.4 人物の絵を「派手な単色の背景（マゼンタか緑）」で描き直して、色で背景を抜く（白い背景だと白い服・白い所が残ったり透けたりしたため）。
使い方: python tools/vivid_redo.py 作業フォルダ [名前 ...] [--denoise 0.5] [--seed N]
・名前は下の ITEMS のキー（town/w_kyo_a など）。省くと全員。
・今の絵（切り抜き済み）を背景色の上に置き、ComfyUI（Z-Image Turbo）の img2img で絵ごと描き直す（背景は単色にさせる）。
・背景色は服の色とぶつからない方（マゼンタ／緑）を絵の色から自動で選ぶ。
・--real：2.98.1 ユーザーの好みの描き方。まずリアル寄りに描き直し（denoise 0.55）、それを元にアニメ調のセル塗りへ（denoise 0.65。anime_redo.py と同じ指示）。ポーズは今の絵のまま
・作業フォルダに 名前_raw.png（描き直した絵）と 名前.png（切り抜き、高さ640）を作る。assets へのコピーは --apply。
"""
import os, sys, json, uuid, io, shutil, urllib.request
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_creature_art as G
from gen_cute import KINDS, CHAR, REAL
from anime_redo import ANIME as ANIME_REDO

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")
TOWNS = ["tsushima", "shinagawa", "tsuruga", "yamaguchi", "sakata", "utazu", "sakai", "kyo", "niigata", "hakata"]
ITEMS = {f"town/w_{t}_a": ("w_tsushima2" if t == "tsushima" else "w_" + t) for t in TOWNS}
ITEMS.update({f"town/rp_{t}": "c_rp" + t for t in TOWNS})
ITEMS.update({"town/merchant_p": "c_merchant", "town/drill_p": "c_drill", "town/gosho_p": "c_gosho",
              "town/soncho_p": "c_soncho", "gamble/dealer2_p": "c_dealer", "gamble/boss4": "c_boss3"})
BGS = {"magenta": ((255, 0, 255), "solid flat vivid magenta"), "green": ((0, 255, 0), "solid flat vivid chroma key green")}
STYLE = ("hand drawn japanese TV anime cel illustration, same pose, same clothes, same face shape and age, "
         "clean uniform black lineart, flat cel shading, simple flat colors, natural adult face drawn simply, matte skin, "
         "no glow, no rim light, the character stands in front of a {bg} background that fills the whole picture evenly, "
         "the background is one single flat {bg} color with nothing else in it")
CW, CH = 896, 1216
# 2.98.1 腕と体のすき間などに残った白い背景（外とつながっていないので抜けない）。描き直した絵（_raw、896×1216）の中の点 (x, y) を書くと、その点を含む白い所を抜く
HOLES = {
    "town/rp_hakata": [(647, 875), (261, 875)],
    "town/rp_tsushima": [(249, 767), (664, 773)],
    "town/rp_shinagawa": [(583, 865)],
    "town/soncho_p": [(699, 949), (238, 474)],
    "town/w_yamaguchi_a": [(380, 367)],  # --real で描き直した絵の座標
    "town/w_tsushima_a": [(241, 432)],
}


def pick_bg(im):
    """服の色に近い方を避ける：マゼンタ寄り（赤紫・桃）の画素と緑寄りの画素を数える"""
    a = np.asarray(im.convert("RGBA")).astype(np.float32) / 255
    rgb, al = a[..., :3], a[..., 3]
    hsv = np.asarray(im.convert("RGB").convert("HSV")).astype(np.float32)
    h, s = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255
    m = (al > 0.5) & (s > 0.25)
    mag = (m & (h > 260) & (h < 345)).sum()
    grn = (m & (h > 75) & (h < 165)).sum()
    return "green" if mag > grn else "magenta"


def compose(im, col):
    """今の絵を背景色の画布に置く（下はそろえる＝膝下で切れたまま）"""
    k = (CH - 48) / im.height
    if im.width * k > CW - 32: k = (CW - 32) / im.width
    fig = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    can = Image.new("RGBA", (CW, CH), col + (255,))
    can.alpha_composite(fig, ((CW - fig.width) // 2, CH - fig.height))
    return can.convert("RGB")


def upload(img):
    b = "----sgk" + uuid.uuid4().hex; buf = io.BytesIO(); img.save(buf, "PNG")
    name = "sgk_vivid_" + uuid.uuid4().hex[:8] + ".png"
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}\"\r\nContent-Type: image/png\r\n\r\n").encode() + buf.getvalue() + f"\r\n--{b}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{b}--\r\n".encode()
    r = urllib.request.Request(G.COMFY + "/upload/image", data=body, headers={"Content-Type": "multipart/form-data; boundary=" + b})
    return json.loads(urllib.request.urlopen(r, timeout=60).read())["name"]


def key_alpha(rgb, bgname):
    """背景色らしさ（0〜1）。マゼンタなら R・B が高く G が低い、緑なら G が高く R・B が低い"""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    k = (np.minimum(r, b) - g) if bgname == "magenta" else (g - np.maximum(r, b))
    return np.clip((k - 0.18) / 0.30, 0, 1)  # 1＝背景


def flood(mask):
    """外のふちとつながった所だけ True（中の小さな色かぶりは抜かない）"""
    from collections import deque
    H, W = mask.shape; out = np.zeros_like(mask); dq = deque()
    for y in range(H):
        for x in (0, W - 1):
            if mask[y, x] and not out[y, x]: out[y, x] = True; dq.append((y, x))
    for x in range(W):
        for y in (0, H - 1):
            if mask[y, x] and not out[y, x]: out[y, x] = True; dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= yy < H and 0 <= xx < W and mask[yy, xx] and not out[yy, xx]:
                out[yy, xx] = True; dq.append((yy, xx))
    return out


def holes(rgb, pts):
    """点を含む白い所（と、そのふち2px）を返す。ふちは白さに応じて半透明"""
    from scipy import ndimage
    mn, mx = rgb.min(-1), rgb.max(-1)
    lab, _ = ndimage.label((mn > 0.85) & (mx - mn < 0.1))
    m = np.zeros(mn.shape, bool)
    for x, y in pts:
        if lab[y, x]: m |= lab == lab[y, x]
        else: print("  hole point not white:", x, y)
    reg = ndimage.binary_dilation(m, iterations=2)
    return np.where(reg, np.clip((mn - 0.55) / 0.35, 0, 1), 0.0)  # 1＝抜く


def cut(raw, bgname, pts=()):
    rgb = np.asarray(raw.convert("RGB")).astype(np.float32) / 255
    hk = holes(rgb, pts) if pts else None
    bgc = np.array(BGS[bgname][0], np.float32) / 255
    kb = key_alpha(rgb, bgname)
    # 外とつながった背景＋腕と体のすき間などに囲まれた背景色（はっきり背景色の画素が80以上のかたまり）
    from scipy import ndimage
    lab, _ = ndimage.label(kb > 0.05)
    strong = ndimage.sum(kb > 0.6, lab, np.arange(lab.max() + 1))
    keep = strong >= 80; keep[0] = False
    outside = flood(kb > 0.05) | keep[lab]
    # 背景とつながった所の近く（3px）だけを半透明にしてよい所とする
    near = outside.copy()
    for _ in range(3):
        n = near.copy(); n[1:] |= near[:-1]; n[:-1] |= near[1:]; n[:, 1:] |= near[:, :-1]; n[:, :-1] |= near[:, 1:]; near = n
    al = np.where(near, 1 - kb, 1.0)
    al = np.where(outside & (kb > 0.95), 0.0, al)
    # 背景色の混ざりを取り除く（ふちの色かぶり）
    q = np.clip(al, 1e-3, 1)[..., None]
    un = np.clip((rgb - (1 - q) * bgc) / q, 0, 1)
    rgb = np.where((near & (al < 0.999))[..., None], un, rgb)
    # ふちに残る色かぶりを抑える
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    if bgname == "magenta":
        # R・B の両方が G より高い（マゼンタ寄り）ときだけ、低い方を G の近くまで下げる
        lim = g + 0.06; sp = near & (np.minimum(r, b) > lim)
        rgb = np.stack([np.where(sp & (r <= b), lim, r), g, np.where(sp & (b < r), lim, b)], -1)
    else:
        lim = np.maximum(r, b) + 0.06; sp = near & (g > lim)
        rgb = np.stack([r, np.where(sp, lim, g), b], -1)
    if hk is not None:  # 白い穴：白の混ざりを取り除いて透明に
        q = np.clip(1 - hk, 1e-3, 1)[..., None]
        rgb = np.where((hk > 0)[..., None], np.clip((rgb - (1 - q)) / q, 0, 1), rgb)
        al = np.minimum(al, 1 - hk)
    out = np.dstack([rgb, al[..., None]])
    im = Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA")
    bb = im.getchannel("A").point(lambda v: 255 if v > 25 else 0).getbbox()
    if bb: im = im.crop((max(0, bb[0] - 6), max(0, bb[1] - 6), min(im.width, bb[2] + 6), min(im.height, bb[3] + 6)))
    k = 640 / im.height
    return im.resize((max(1, round(im.width * k)), 640), Image.LANCZOS)


def img2img(img, prompt, seed, den, models):
    wf = G.workflow(prompt, seed, *models, CW, CH)
    wf["11"] = {"class_type": "LoadImage", "inputs": {"image": upload(img)}}
    wf["7"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["11", 0], "vae": ["3", 0]}}
    wf["8"]["inputs"]["denoise"] = den
    return G.run(wf)


def main():
    a = sys.argv[1:]; den, seed, apply = 0.5, 2684, False
    if "--denoise" in a: i = a.index("--denoise"); den = float(a[i + 1]); del a[i:i + 2]
    if "--seed" in a: i = a.index("--seed"); seed = int(a[i + 1]); del a[i:i + 2]
    if "--apply" in a: a.remove("--apply"); apply = True
    real = "--real" in a
    if real: a.remove("--real")
    out, names = a[0], (a[1:] or list(ITEMS)); os.makedirs(out, exist_ok=True)
    models = G.names()
    for nm in names:
        flat = nm.replace("/", "__")
        rawp, cutp = os.path.join(out, flat + "_raw.png"), os.path.join(out, flat + ".png")
        src = Image.open(os.path.join(ROOT, nm + ".png")).convert("RGBA")
        bgname = pick_bg(src); col, word = BGS[bgname]
        if not os.path.exists(rawp):
            desc = KINDS[ITEMS[nm]][0].replace(CHAR, "")
            bgtxt = f"the character stands in front of a {word} background that fills the whole picture evenly, the background is one single flat {word} color with nothing else in it"
            if real:
                realp = os.path.join(out, flat + "_real.png")
                if not os.path.exists(realp):
                    with open(realp, "xb") as f: f.write(img2img(compose(src, col), desc + ". same pose, same clothes" + REAL + ", " + bgtxt, seed, 0.55, models))
                    print("real:", nm, flush=True)
                data = img2img(Image.open(realp).convert("RGB"), desc + ". " + ANIME_REDO.replace("plain pure white background", bgtxt), seed + 1, 0.65, models)
            else:
                data = img2img(compose(src, col), desc + ". " + STYLE.format(bg=word), seed, den, models)
            with open(rawp, "xb") as f: f.write(data)
            print("drew:", nm, bgname, flush=True)
        if not os.path.exists(cutp):
            raw = Image.open(rawp).convert("RGB")  # 背景色は描いた絵の上の隅で決める（今の絵から選び直すと変わることがある）
            c = np.asarray(raw)[4, [4, -5]].astype(int)
            bgname = "green" if (c[:, 1] - c[:, [0, 2]].max(1)).mean() > 0 else "magenta"
            cut(raw, bgname, HOLES.get(nm, ())).save(cutp)
            print("cut:", cutp, flush=True)
        if apply:
            shutil.copyfile(cutp, os.path.join(ROOT, nm + ".png")); print("applied:", nm)


if __name__ == "__main__":
    main()
