"""2.105.0 遊戯屋の女将（assets/town/yugi_p.png）を描く。ユーザーの好みの描き方：リアル寄り→アニメ調のセル塗り、派手な単色の背景で描いて色で抜く。
使い方: python tools/gen_yugi.py 作業フォルダ [--seeds 4] [--base 2105]
・作業フォルダに yugi_シード_real.png（リアル寄り）・yugi_シード_raw.png（アニメ調）・yugi_シード.png（切り抜き、高さ640）を作る。
・気に入った絵を assets/town/yugi_p.png にコピーして使う。
"""
import os, sys, random
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_creature_art as G
from gen_cute import REAL, KIMONO
from anime_redo import ANIME
import numpy as np
import vivid_redo as V
from vivid_redo import img2img, CW, CH

BGW = "solid flat vivid chroma key green"
BGTXT = f"the character stands in front of a {BGW} background that fills the whole picture evenly, the background is one single flat {BGW} color with nothing else in it"
DESC = (KIMONO + "the proprietress of a sengoku period card game parlor, cool beauty with a playful clever smile, sharp narrow eyes with long lashes, "
        "black hair in a neat updo with one simple red hairpin, deep crimson and black kimono with a small gold plum blossom pattern, a dark purple haori draped over her shoulders, "
        "POSE: one hand on her hip and the other hand raised beside her face with the palm open in a welcoming gesture, empty hands, body turned slightly to the side, "
        "framed from the top of her head down to just below her knees")


def cut(raw):
    """背景がくすんだ緑になるので、ふちの色（中央値）からの色の違いで抜く（vivid_redo.cut の背景色の見分け方だけ差し替える）"""
    a = np.asarray(raw).astype(np.float32) / 255
    bd = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    bg = np.median(bd, 0)
    V.BGS["green"] = (tuple(int(v * 255) for v in bg), "")
    V.key_alpha = lambda rgb, _n: np.clip(1 - (np.sqrt(((rgb - bg) ** 2).sum(-1)) - 0.10) / 0.12, 0, 1)
    return V.cut(raw, "green")


def main():
    a = sys.argv[1:]; n, base = 4, 2105
    if "--seeds" in a: i = a.index("--seeds"); n = int(a[i + 1]); del a[i:i + 2]
    if "--base" in a: i = a.index("--base"); base = int(a[i + 1]); del a[i:i + 2]
    out = a[0]; os.makedirs(out, exist_ok=True)
    models = G.names(); rnd = random.Random(base)
    for _ in range(n):
        seed = rnd.randrange(1, 2**31 - 1); stem = os.path.join(out, f"yugi_{seed}")
        if not os.path.exists(stem + "_real.png"):
            wf = G.workflow(DESC + REAL + ", " + BGTXT, seed, *models, CW, CH)
            with open(stem + "_real.png", "xb") as f: f.write(G.run(wf))
        if not os.path.exists(stem + "_raw.png"):
            data = img2img(Image.open(stem + "_real.png").convert("RGB"), DESC + ". " + ANIME.replace("plain pure white background", BGTXT), seed + 1, 0.65, models)
            with open(stem + "_raw.png", "xb") as f: f.write(data)
        if not os.path.exists(stem + ".png"):
            cut(Image.open(stem + "_raw.png").convert("RGB")).save(stem + ".png")
        print("done:", stem, flush=True)


if __name__ == "__main__":
    main()
