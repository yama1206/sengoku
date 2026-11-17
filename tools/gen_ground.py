"""1.6.74 戦闘の地面テクスチャの元画像を、ローカルのゲートウェイ（Z-Image Turbo）で作る。
使い方: python tools/gen_ground.py 出力フォルダ [種類 ...] [--seeds N] [--base シードの元]
・ゲートウェイの一括生成（/batch_status の running）が終わるまで待ってから作る。429 の時も待ってやり直す。
・出力フォルダに 種類_シード.png で保存する。同じ名前があれば作らない（上書きしない）。
"""
import json, os, sys, time, random, urllib.request, urllib.error

GW = "http://127.0.0.1:8765"
KEY_FILE = os.path.expanduser(r"~\source\local-ai-gateway\api_key.txt")
TAIL = (", top-down orthographic view looking straight down at flat ground, uniform soft overcast lighting,"
        " no shadows, no sky, no horizon, no perspective, no objects, even density across the whole image,"
        " seamless tileable texture, photorealistic, sharp fine detail, 8k photo scan")
KINDS = {
    "grass_lush": "photo texture of dense short wild meadow grass, fresh green blades of varied shades, a few tiny weeds",
    "grass_dry": "photo texture of short dry autumn grass on a hillside, mixed yellow-green and straw colored blades, bits of bare soil",
    "grass_weedy": "photo texture of trampled rural field grass mixed with clover, plantain leaves and small weeds, green with patches of bare dirt",
    "forest_floor": "photo texture of mixed broadleaf forest floor seen from directly above, dense dry brown and dark fallen oak leaves, small twigs, a few cedar needles, patches of moss, dark soil",
    "dirt_packed": "photo texture of dry bare dirt ground seen from directly above, brown compacted soil with many small pebbles, coarse grit, shallow cracks, a few scattered dry grass blades, uneven surface",
    "dirt_rocky": "photo texture of rocky brown earth seen from directly above, many angular grey rocks of different sizes half buried in soil, gravel, a few small dry grass tufts",
    "mud_bank": "photo texture of damp muddy riverbank, dark brown wet soil, sand, small stones and sparse reeds",
    "riverbed": "photo texture of riverbed seen from directly above, densely packed rounded grey and brown river stones and pebbles of many sizes, gravel filling the gaps",
}


def req(path, key, body=None, timeout=200):
    r = urllib.request.Request(GW + path, data=json.dumps(body).encode() if body is not None else None,
                               headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=timeout) as f:
        return f.read()


def wait_idle(key):
    while True:
        try:
            st = json.loads(req("/batch_status", key, timeout=15))
            if not st.get("running"):
                return
            print(f"  一括生成中 {st.get('done')}/{st.get('total')} … 待つ", flush=True)
        except urllib.error.URLError as e:
            print("  ゲートウェイに繋がらない:", e, flush=True)
        time.sleep(30)


def main():
    a = sys.argv[1:]
    seeds, base = 3, 1674
    if "--seeds" in a:
        i = a.index("--seeds"); seeds = int(a[i + 1]); del a[i:i + 2]
    if "--base" in a:  # 別のシードの並びで作り直す時
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
                print("あり:", dst); continue
            while True:
                wait_idle(key)
                try:
                    res = json.loads(req("/generate_image", key, {"prompt": KINDS[k] + TAIL, "width": 1024, "height": 1024, "seed": seed}))
                    break
                except urllib.error.HTTPError as e:
                    if e.code == 429:
                        time.sleep(20); continue
                    print("エラー", k, e.code, e.read()[:500]); res = None; break
            if not res:
                continue
            name = res["image_markdown"].split("/images/")[1].rstrip(")")
            data = urllib.request.urlopen(GW + "/images/" + name, timeout=30).read()
            with open(dst, "xb") as f:
                f.write(data)
            print("作成:", dst, res.get("seconds"), "秒", flush=True)


if __name__ == "__main__":
    main()
