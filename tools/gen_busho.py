"""2.14.0 武将の立ち絵を家ごとに作る（1人1枚。崩れたものだけ描き直す）。
使い方: python tools/gen_busho.py tools/busho/家.json 出力フォルダ [--redo 名前,名前,...] [--base シードの元]
・家.json：{"faction": "oda", "color": "#c8402f", "people": [{"name": "織田信長", "age": 26, "look": "..."}, ...]}
  age・look（見た目の決まった特徴）はなくてもよい。なければ名前から決まる形で年や顔だちを散らす
・出力は 出力フォルダ/b_<名前のハッシュ>_<シード>.png。白い背景なので tools/cutone.py --person で抜く
・ゲームでは js/data/bushoart.js の一覧にある名前だけ絵を出す（ファイル名は同じハッシュ。js 側は SGK.bushoKey）
・待ち方・保存の決まりは gen_cute.py と同じ（一括生成が終わるまで待つ。同じ名前があれば作らない）
"""
import json, os, sys, random, urllib.request, urllib.error, time, colorsys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_ground import GW, KEY_FILE, req, wait_idle
from gen_cute import PERIOD

# 2.14.0 娘たちの ANIME/CHAR だと幼く・全身が小さく出るので、武将は別に決める（大人の頭身・太ももから上・顔を大きく）
STYLE = ", modern japanese anime illustration style, handsome detailed adult character design, realistic adult proportions, soft cel shading, clean thin lineart, high quality game character art"
STYLES = {  # --style で選ぶ（2.14.0 絵柄の見比べ用）
    "anime": STYLE,
    "gekiga": ", japanese gekiga manga illustration style, bold thick black ink lines, heavy dramatic shadows with hatching, rugged realistic mature adult face, intense masculine look, high contrast, detailed",
    "wafu": ", traditional japanese painting style like a muromachi period hanging scroll portrait of a warlord and edo period ukiyo-e, fine sumi ink outlines, flat muted pale colors, elegant restrained brushwork",
    "atsunuri": ", semi-realistic painterly digital painting, thick brush strokes, detailed realistic adult face with natural skin, dramatic warm lighting, like a japanese historical strategy game general portrait illustration",
}
STYLES["paint"] = ", painterly illustration like a japanese historical strategy game general portrait, semi-realistic but clearly a hand painted illustration and not a photo, visible thick brush strokes, slightly stylized strong features, rich warm colors, dramatic lighting"
POSES = ["standing with arms crossed", "one hand resting on the hilt of his katana, the other at his side", "both hands on his hips, chest out", "body in a three-quarter view, looking at the viewer over his shoulder", "one arm raised forward as if giving an order", "hands clasped behind his back, upright posture", "one fist resting on his hip, the other arm relaxed", "gripping the scabbard of his katana at the waist with one hand", "slightly leaning forward with a hand on his knee", "standing calmly with hands tucked into his sleeves"]
FRAME = ", medium shot from the thighs up, the face is large and clearly detailed, facing the viewer, isolated on a pure white background, no shadow, no text, no letters, the head fits inside the frame with white margin above"


def age_words(age):
    if age < 22: return f"a youth of about {age} with a young face"
    if age <= 30: return f"a man in his twenties, about {age} years old"
    if age <= 42: return f"a middle-aged man about {age} years old with a mature masculine face and faint lines on his face"
    if age <= 52: return f"a middle-aged man about {age} years old with a weathered face, wrinkles around the eyes and some grey hair"
    return f"an old man about {age} years old with a deeply wrinkled face and grey hair"


def key(name):
    """名前 → 8桁の16進（FNV-1a 32bit。js の SGK.bushoKey と同じ）"""
    h = 0x811C9DC5
    for b in name.encode("utf-8"):
        h ^= b; h = (h * 0x01000193) & 0xFFFFFFFF
    return "%08x" % h


def color_name(hx):
    r, g, b = (int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5))
    hh, ll, ss = colorsys.rgb_to_hls(r, g, b); deg = hh * 360
    if ss < 0.18: return "charcoal grey"
    names = [(15, "crimson red"), (40, "rust orange"), (60, "ochre gold"), (90, "olive green"), (160, "deep green"), (195, "teal"), (240, "indigo blue"), (285, "purple"), (330, "plum"), (360, "crimson red")]
    for lim, n in names:
        if deg < lim: return n
    return "crimson red"


FACE = ["sharp intelligent eyes and a narrow face", "a broad square jaw and thick eyebrows", "calm gentle eyes and a soft oval face", "fierce glaring eyes and a strong nose", "a lean face with high cheekbones", "a round friendly face", "a stern weathered face", "sly narrow eyes and a thin smile", "a handsome noble face", "a rugged face with a small scar on the cheek"]
BUILD = ["tall and lean", "stocky and broad shouldered", "average build", "big and muscular", "slender"]
HAIR_YOUNG = ["black hair in a chonmage topknot", "black hair in a chasen-mage topknot", "black hair tied back in a short ponytail topknot"]
HAIR_OLD = ["grey streaked hair in a chonmage topknot", "thinning grey hair in a small topknot"]
BEARD = ["clean shaven", "a thin mustache", "a mustache and short chin beard", "a full short beard", "clean shaven"]
EXPR = ["a confident smile", "a serious expression", "a calm composed expression", "a slight smirk", "a determined look"]


def describe(p, faction_color, style="anime"):
    n = p["name"]; h = int(key(n), 16); rnd = random.Random(h)
    age = p.get("age") or rnd.choice([24, 28, 32, 36, 40, 45, 50, 55])
    monk = p.get("monk") or any(t in n for t in ("入道", "斎", "庵", "宗運", "玄以", "雪斎", "卜伝"))
    woman = p.get("woman")
    hair = "a cleanly shaved monk head" if monk else rnd.choice(HAIR_OLD if age >= 48 else HAIR_YOUNG)
    beard = "clean shaven" if age < 22 else rnd.choice(BEARD)
    armor = rnd.random() < 0.6 if "armor" not in p else p["armor"]
    col = color_name(faction_color)
    if woman:
        who = f"a dignified japanese woman warrior of the sengoku period, about {age} years old, clearly adult, {rnd.choice(FACE[:3] + FACE[4:5] + FACE[8:9])}, long black hair tied back, {rnd.choice(EXPR)}, "
        cloth = f"wearing light {col} laced armor over a kimono, a hachimaki headband, " if armor else f"wearing a formal {col} kimono with a long uchikake coat, "
    else:
        b, fc, ex = rnd.choice(BUILD), rnd.choice(FACE), rnd.choice(EXPR)
        who = (f"a japanese sengoku period samurai bushou warlord, {age_words(age)}, {hair}, " if p.get("look")  # 決まった見た目があれば、ばらつきは入れない
               else f"a japanese sengoku period samurai bushou warlord, {age_words(age)}, {b}, {fc}, {hair}, {beard}, {ex}, ")
        cloth = (f"wearing dark lacquered tosei-gusoku samurai armor with {col} silk lacing accents over a dark kimono, no helmet, " if armor
                 else f"wearing a muted {col} kataginu vest and dark hakama over a {rnd.choice(['grey', 'brown', 'dark blue', 'black'])} kimono, ")
    look = (p.get("look", "") + ", ") if p.get("look") else ""
    return who + look + cloth + "a katana at the waist, " + (p.get("pose") or rnd.choice(POSES)) + ", no objects held in the hands" + STYLES[style] + PERIOD + FRAME


def main():
    a = sys.argv[1:]; redo, base, style = None, 2140, "anime"
    if "--style" in a: i = a.index("--style"); style = a[i + 1]; del a[i:i + 2]
    if "--redo" in a: i = a.index("--redo"); redo = set(a[i + 1].split(",")); del a[i:i + 2]
    if "--base" in a: i = a.index("--base"); base = int(a[i + 1]); del a[i:i + 2]
    fam = json.load(open(a[0], encoding="utf-8")); out = a[1]
    os.makedirs(out, exist_ok=True)
    k0 = open(KEY_FILE, encoding="utf-8").read().strip()
    rnd = random.Random(base)
    for p in fam["people"]:
        seed = rnd.randrange(1, 2**31 - 1)
        if redo is not None and p["name"] not in redo: continue
        kk = key(p["name"])
        if redo is None and any(f.startswith(f"b_{kk}_") for f in os.listdir(out)):
            print("exists:", p["name"]); continue
        dst = os.path.join(out, f"b_{kk}_{seed}.png")
        if os.path.exists(dst): print("exists:", dst); continue
        prompt = describe(p, fam["color"], style)
        while True:
            wait_idle(k0)
            try:
                res = json.loads(req("/generate_image", k0, {"prompt": prompt, "width": 832, "height": 1216, "seed": seed})); break
            except urllib.error.HTTPError as e:
                if e.code == 429: time.sleep(20); continue
                print("error", p["name"], e.code, e.read()[:300]); res = None; break
        if not res: continue
        nm = res["image_markdown"].split("/images/")[1].rstrip(")")
        data = urllib.request.urlopen(GW + "/images/" + nm, timeout=30).read()
        with open(dst, "xb") as f: f.write(data)
        print("made:", p["name"], dst, res.get("seconds"), "s", flush=True)


if __name__ == "__main__":
    main()
