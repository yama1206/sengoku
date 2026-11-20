"""2.54.0 リアル寄りの人物の絵を元に、ポーズ・顔立ちを保ったままアニメ調に描き直す（ComfyUI の Z-Image Turbo で img2img）。
使い方: python tools/anime_redo.py 出力フォルダ 元.png [元.png ...] [--denoise 0.65] [--seed N]
・元の絵を ComfyUI に送り、絵柄だけを替える（denoise が大きいほど元から離れる）。出力は 元の名前_a<denoise>.png
・AIっぽさ（つやつやのエアブラシ塗り・描き込み過多の髪・光るふち・ぼかし）を避け、TVアニメのセル塗りに寄せる
"""
import json, os, sys, uuid, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_creature_art import COMFY, names, call
from gen_cute import KINDS, CHAR
import gen_creature_art as G

ANIME = ("hand drawn japanese TV anime cel illustration, same pose, same clothes, same face shape and age, "
         "clean uniform black lineart with even line weight, flat cel shading with only two tones per color, "
         "simple flat colors, limited muted palette, few simple hair strands drawn as clumps, natural adult face drawn simply, "
         "matte skin with no highlights, simple muscle lines only, no gradients, no airbrush, no glossy skin, no shine, no glow, no rim light, no texture noise, "
         "plain pure white background, no text")


def upload(path):
    b = "----sgk" + uuid.uuid4().hex; name = "sgk_" + os.path.basename(path)
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}\"\r\nContent-Type: image/png\r\n\r\n").encode() + open(path, "rb").read() + f"\r\n--{b}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{b}--\r\n".encode()
    r = urllib.request.Request(COMFY + "/upload/image", data=body, headers={"Content-Type": "multipart/form-data; boundary=" + b})
    return json.loads(urllib.request.urlopen(r, timeout=60).read())["name"]


def main():
    a = sys.argv[1:]; den, seed = 0.55, 2540
    if "--denoise" in a: i = a.index("--denoise"); den = float(a[i + 1]); del a[i:i + 2]
    if "--seed" in a: i = a.index("--seed"); seed = int(a[i + 1]); del a[i:i + 2]
    out, srcs = a[0], a[1:]; os.makedirs(out, exist_ok=True)
    unet, clip, vae = names()
    for src in srcs:
        dst = os.path.join(out, os.path.basename(src)[:-4] + f"_a{int(den * 100)}.png")
        if os.path.exists(dst): print("exists:", dst); continue
        # 元の絵の説明（gen_cute.py の c_〇〇。x_dealer_シード.png → c_dealer）を先頭に置き、持ち物などが別の物に変わらないようにする
        desc = KINDS["c_" + os.path.basename(src).split("_")[1]][0].replace(CHAR, "")
        wf = G.workflow(desc + ". " + ANIME, seed, unet, clip, vae)
        wf["11"] = {"class_type": "LoadImage", "inputs": {"image": upload(src)}}
        wf["7"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["11", 0], "vae": ["3", 0]}}
        wf["8"]["inputs"]["denoise"] = den
        data = G.run(wf)
        with open(dst, "xb") as f: f.write(data)
        print("made:", dst, flush=True)


if __name__ == "__main__":
    main()
