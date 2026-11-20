"""2.54.0 gen_art.py・gen_cute.py の KINDS（アイコン・人物）を、ゲートウェイを使わず ComfyUI（Z-Image Turbo）で直接作る。
使い方: python tools/gen_icons.py 出力フォルダ 名前 [名前 ...] [--seeds N] [--base シードの元]
・出力フォルダに 名前_シード.png で保存（同じ名前があれば作らない）。
・できた絵は tools/cutone.py 元.png assets/icons/名前.png --size 192 で背景を抜く。
"""
import os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_art import KINDS
from gen_cute import KINDS as _CUTE
KINDS = {**_CUTE, **KINDS}  # 人物（gen_cute.py）も作れる
from gen_creature_art import names, workflow, run


def main():
    a = sys.argv[1:]; seeds, base = 2, 2540
    if "--seeds" in a: i = a.index("--seeds"); seeds = int(a[i + 1]); del a[i:i + 2]
    if "--base" in a: i = a.index("--base"); base = int(a[i + 1]); del a[i:i + 2]
    out, kinds = a[0], a[1:]
    os.makedirs(out, exist_ok=True)
    unet, clip, vae = names()
    for k in kinds:
        prompt, wd, ht = KINDS[k]; rnd = random.Random(f"{base}-{k}")
        for _ in range(seeds):
            seed = rnd.randrange(1, 2**31 - 1); dst = os.path.join(out, f"{k}_{seed}.png")
            if os.path.exists(dst): print("exists:", dst); continue
            data = run(workflow(prompt, seed, unet, clip, vae, wd, ht))
            with open(dst, "xb") as f: f.write(data)
            print("made:", dst, flush=True)


if __name__ == "__main__":
    main()
