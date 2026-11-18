"""2.19.0 魚・虫の絵（図鑑・捕れた画面）を、ComfyUI の Z-Image Turbo で直接作る（ゲートウェイは要らない）。
使い方: python tools/gen_creature_art.py 出力フォルダ [id ...] [--seeds N] [--base シードの元]
・描き方は tools/creature_prompts.json（id → 英語の見た目の説明）。Wikipedia の写真を見て、種ごとの見分けどころを書いたもの。
  おかしい絵は、ここの説明を直して作り直す。
・出力フォルダに id_シード.png で保存する。同じ名前があれば作らない（上書きしない）。
・できた絵は tools/cutone.py で背景を抜き、tools/to_webp.py で assets/creatures/id.webp にする。
"""
import json, os, sys, time, random, urllib.request, urllib.parse, uuid

COMFY = "http://127.0.0.1:8188"
HERE = os.path.dirname(os.path.abspath(__file__))
STYLE = (", japanese ukiyo-e woodblock print style illustration, edo period natural history scroll, bold clean ink outlines, "
         "flat muted traditional colors, plain pure white paper")
FISH = ", single fish in side view facing left, whole body from snout to tail fin inside the frame"
BUG = ", single insect, the whole insect with all legs, wings and antennae inside the frame"
TAIL = ", centered, isolated on a pure white background, no shadow, no text, no water, no plants, white margin around"


def call(path, body=None, timeout=30):
    r = urllib.request.Request(COMFY + path, data=json.dumps(body).encode() if body is not None else None,
                               headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=timeout) as f:
        return f.read()


def names():
    info = json.loads(call("/object_info", timeout=30))
    pick = lambda opts, key: next(o for o in opts if key in o.lower())
    return (pick(info["UNETLoader"]["input"]["required"]["unet_name"][0], "z_image_turbo"),
            pick(info["CLIPLoader"]["input"]["required"]["clip_name"][0], "qwen_3_4b"),
            pick(info["VAELoader"]["input"]["required"]["vae_name"][0], "ae"))


def workflow(prompt, seed, unet, clip, vae, w=1024, h=1024):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": unet, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": clip, "type": "lumina2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": vae}},
        "4": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "6": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["5", 0]}},
        "7": {"class_type": "EmptySD3LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "8": {"class_type": "KSampler", "inputs": {
            "model": ["4", 0], "seed": seed, "steps": 8, "cfg": 1, "sampler_name": "res_multistep",
            "scheduler": "simple", "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["7", 0], "denoise": 1}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": "sengoku/creature"}},
    }


def run(wf):
    pid = json.loads(call("/prompt", {"prompt": wf, "client_id": str(uuid.uuid4())}))["prompt_id"]
    t0 = time.time()
    while time.time() - t0 < 300:
        time.sleep(1.5)
        h = json.loads(call("/history/" + pid))
        if pid in h:
            if h[pid].get("status", {}).get("status_str") == "error":
                raise RuntimeError(json.dumps(h[pid]["status"], ensure_ascii=False)[:1000])
            imgs = h[pid].get("outputs", {}).get("10", {}).get("images", [])
            if imgs:
                im = imgs[0]
                q = urllib.parse.urlencode({"filename": im["filename"], "subfolder": im["subfolder"], "type": im["type"]})
                return call("/view?" + q, timeout=60)
    raise RuntimeError("5分たっても終わらない")


def prompt_of(cid, e):
    """e は creature_prompts.json の1件。v があれば向きの決まり（FISH・BUG）の代わりに使う（ヒラメなど）"""
    return e["d"] + e.get("v", FISH if cid.startswith("f") else BUG) + STYLE + TAIL


def main():
    a = sys.argv[1:]
    seeds, base = 1, 2160
    if "--seeds" in a: i = a.index("--seeds"); seeds = int(a[i + 1]); del a[i:i + 2]
    if "--base" in a: i = a.index("--base"); base = int(a[i + 1]); del a[i:i + 2]
    P = json.load(open(os.path.join(HERE, "creature_prompts.json"), encoding="utf-8"))
    out, ids = a[0], (a[1:] or [k for k in P if not k.startswith("_")])
    os.makedirs(out, exist_ok=True)
    unet, clip, vae = names()
    for cid in ids:
        rnd = random.Random(f"{base}-{cid}")
        for _ in range(seeds):
            seed = rnd.randrange(1, 2**31 - 1)
            dst = os.path.join(out, f"{cid}_{seed}.png")
            if os.path.exists(dst):
                print("exists:", dst); continue
            data = run(workflow(prompt_of(cid, P[cid]), seed, unet, clip, vae))
            with open(dst, "xb") as f:
                f.write(data)
            print("made:", dst, flush=True)


if __name__ == "__main__":
    main()
