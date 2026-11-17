"""2.6.5 戦場の木の元画像（枝葉・樹皮）を、ローカルのゲートウェイで作る。
使い方: python tools/gen_tree.py 出力フォルダ [種類 ...] [--seeds N] [--base シードの元]
・枝葉は白い背景で作る（tools/cutout.py で背景を抜いて、葉の板に貼る）。樹皮はつなぎ目なしにする（tools/seamless.py）。
・待ち方・保存の決まりは gen_ground.py と同じ（一括生成が終わるまで待つ。同じ名前があれば作らない）。
"""
import json, os, sys, random, urllib.request, urllib.error, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_ground import GW, KEY_FILE, req, wait_idle

ISO = (", isolated on a pure white background, studio product photo, soft even lighting, no shadow, sharp focus,"
       " the whole branch fits inside the frame with white margin, photorealistic, high detail")
BARK = (", straight-on close-up, uniform soft overcast lighting, no shadows, fills the whole frame, even detail,"
        " seamless tileable texture, photorealistic, sharp fine detail, 8k photo scan")
KINDS = {
    "sugi": "a single fan-shaped branch spray of japanese cedar (cryptomeria japonica), dense dark green awl-shaped needles on drooping twigs" + ISO,
    "pine": "a branch tip of japanese red pine with several dense round tufts of long green needles radiating outward" + ISO,
    "oak": "a leafy twig cluster of japanese konara oak, many overlapping fresh green serrated leaves, dense roundish bunch" + ISO,
    "keyaki": "a dense rounded bunch of small serrated green zelkova leaves on thin brown twigs" + ISO,
    "bark_sugi": "photo texture of japanese cedar tree bark, long vertical fibrous reddish brown strips peeling in thin ribbons" + BARK,
    "bark_sugi2": "close-up photograph of the trunk bark of an old japanese cedar tree, rough stringy reddish brown and grey bark peeling in long vertical shreds, deep grooves between the strips, natural weathered texture" + BARK,
    "bark_pine": "photo texture of japanese red pine bark, thick grey brown scaly plates with reddish orange cracks between them" + BARK,
    "bark_oak": "photo texture of old oak tree bark, grey brown with deep irregular vertical furrows and patches of lichen" + BARK,
}


def main():
    a = sys.argv[1:]
    seeds, base = 4, 2650
    if "--seeds" in a:
        i = a.index("--seeds"); seeds = int(a[i + 1]); del a[i:i + 2]
    if "--base" in a:
        i = a.index("--base"); base = int(a[i + 1]); del a[i:i + 2]
    out, kinds = a[0], (a[1:] or list(KINDS))
    os.makedirs(out, exist_ok=True)
    key = open(KEY_FILE, encoding="utf-8").read().strip()
    rnd = random.Random(base)
    for k in kinds:
        for j in range(seeds):
            seed = rnd.randrange(1, 2**31 - 1)
            dst = os.path.join(out, f"{k}_{seed}.png")
            if os.path.exists(dst):
                print("exists:", dst); continue
            while True:
                wait_idle(key)
                try:
                    res = json.loads(req("/generate_image", key, {"prompt": KINDS[k], "width": 1024, "height": 1024, "seed": seed}))
                    break
                except urllib.error.HTTPError as e:
                    if e.code == 429:
                        time.sleep(20); continue
                    print("error", k, e.code, e.read()[:500]); res = None; break
            if not res:
                continue
            name = res["image_markdown"].split("/images/")[1].rstrip(")")
            data = urllib.request.urlopen(GW + "/images/" + name, timeout=30).read()
            with open(dst, "xb") as f:
                f.write(data)
            print("made:", dst, res.get("seconds"), "s", flush=True)


if __name__ == "__main__":
    main()
