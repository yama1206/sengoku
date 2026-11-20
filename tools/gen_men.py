"""2.61.0 練兵所の男たちの絵を、ComfyUI（Z-Image Turbo）に直接たのんでリアル寄りに作る（gen_cute.py の x_rp〇〇）。
使い方: python tools/gen_men.py 出力フォルダ [町 ...] [--seeds N] [--base シードの元]
・このあと tools/anime_redo.py でアニメ調に描き直し、tools/cutone.py --person で背景を抜く
"""
import os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_creature_art as G
from gen_cute import KINDS

TOWNS = ["tsushima", "shinagawa", "tsuruga", "yamaguchi", "sakata", "utazu", "sakai", "kyo", "niigata", "hakata"]


def main():
    a = sys.argv[1:]; seeds, base = 1, 2610
    if "--seeds" in a: i = a.index("--seeds"); seeds = int(a[i + 1]); del a[i:i + 2]
    if "--base" in a: i = a.index("--base"); base = int(a[i + 1]); del a[i:i + 2]
    out, towns = a[0], (a[1:] or TOWNS); os.makedirs(out, exist_ok=True)
    unet, clip, vae = G.names()
    for t in towns:
        prompt, wd, ht = KINDS["x_rp" + t]; rnd = random.Random(f"{base}-{t}")
        for _ in range(seeds):
            seed = rnd.randrange(1, 2**31 - 1); dst = os.path.join(out, f"x_rp{t}_{seed}.png")
            if os.path.exists(dst): print("exists:", dst); continue
            data = G.run(G.workflow(prompt, seed, unet, clip, vae, wd, ht))
            with open(dst, "xb") as f: f.write(data)
            print("made:", dst, flush=True)


if __name__ == "__main__":
    main()
