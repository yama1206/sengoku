"""2.12.4 賭場の絵・地図の印（特産など）の元画像を、ローカルのゲートウェイで作る。
使い方: python tools/gen_art.py 出力フォルダ [種類 ...] [--seeds N] [--base シードの元]
・白い背景で作るもの（ISO）は tools/cutout.py の仕組みで背景を抜いて使う。背景の絵（BG）はそのまま。
・待ち方・保存の決まりは gen_ground.py と同じ（一括生成が終わるまで待つ。同じ名前があれば作らない）。
"""
import json, os, sys, random, urllib.request, urllib.error, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_ground import GW, KEY_FILE, req, wait_idle

STYLE = ", japanese ukiyo-e woodblock print style illustration, edo period, bold clean ink outlines, flat muted traditional colors, subtle washi paper texture"
ICON = STYLE + ", single object centered, game item icon, isolated on a pure white background, no shadow, no text, the whole object fits inside the frame with white margin"
CHAR = STYLE + ", full body, isolated on a pure white background, no shadow, no text, the whole figure fits inside the frame with white margin"
BG = STYLE + ", wide scene, no text, no people in the foreground"
# 名前: (文, 幅, 高さ)
KINDS = {
    # 特産・品物の印（地図・拠点・持ち物）
    "ico_rice": ("a straw rice bale tied with rope and a sheaf of golden rice ears" + ICON, 1024, 1024),
    "ico_salt": ("a small straw bag full of white coarse sea salt with salt spilling out" + ICON, 1024, 1024),
    "ico_cotton": ("a rolled bolt of indigo dyed cotton cloth with a white cotton boll" + ICON, 1024, 1024),
    "ico_sake": ("a wooden sake barrel with straw wrapping and a ceramic sake bottle" + ICON, 1024, 1024),
    "ico_firewood": ("a bundle of split firewood logs tied with straw rope" + ICON, 1024, 1024),
    "ico_iron": ("a pile of dark iron sand ingots with a blacksmith hammer" + ICON, 1024, 1024),
    "ico_tea": ("a ceramic tea jar with green tea leaves beside it" + ICON, 1024, 1024),
    "ico_anchor": ("an old iron ship anchor with a rope" + ICON, 1024, 1024),
    # 釣り・虫取り
    "ico_rod": ("a bamboo fishing rod with line and a red and white float" + ICON, 1024, 1024),
    "ico_net": ("a bamboo insect catching net" + ICON, 1024, 1024),
    "ico_fish": ("a single sweetfish ayu fish jumping" + ICON, 1024, 1024),
    "ico_bug": ("a single japanese rhinoceros beetle" + ICON, 1024, 1024),
    "ico_bite": ("a red fishing float bobbing with splashing water ripples" + ICON, 1024, 1024),
    "ico_crown": ("a small golden lacquered noble court hat crown ornament" + ICON, 1024, 1024),
    "ico_cloud": ("a single stylized japanese auspicious cloud" + ICON, 1024, 1024),
    "ico_swords": ("two crossed katana swords" + ICON, 1024, 1024),
    "ico_warn": ("a red wooden warning signboard with a big exclamation mark shape" + ICON, 1024, 1024),
    "ico_star": ("a single golden five pointed star with a soft glow" + ICON, 1024, 1024),
    "ico_check": ("a single bold green brush stroke check mark" + ICON, 1024, 1024),
    "ico_cross": ("a single bold red brush stroke x mark" + ICON, 1024, 1024),
    "suit_sword2": ("a single straight double edged sword with a round guard, lying diagonally, no card, no frame, no background shape" + ICON, 1024, 1024),
    "ico_miss2": ("a small white puff of smoke cloud with a few water splash droplets flying, nothing else" + ICON, 1024, 1024),
    "it_tray2": ("an empty round shallow lacquered wooden tray seen from above, nothing on it, plain smooth wood surface" + ICON, 1024, 1024),
    "ico_miss": ("a small puff of dust and splashing water drops" + ICON, 1024, 1024),
    # 賭場
    "bg_den": ("interior of an edo period gambling den at night, tatami room lit by paper andon lanterns, a long white cloth gambling mat on the floor in the center, wooden pillars, shoji screens, warm orange light, dark corners" + BG, 1344, 768),
    "ch_dealer": ("a tsubofuri dice dealer man kneeling in seiza with one shoulder bare and a sarashi cloth around his belly, holding a bamboo dice cup, tattoo on his arm, serious face" + CHAR, 1024, 1024),
    "ch_boss": ("an old yakuza gambling boss oyabun in a dark kimono sitting cross-legged smoking a long kiseru pipe, sly smile" + CHAR, 1024, 1024),
    "it_tsubo": ("a woven rattan dice cup tsubo used for chouhan gambling, upside down" + ICON, 1024, 1024),
    "it_coins": ("a stack of old japanese mon copper coins with square holes strung on a cord" + ICON, 1024, 1024),
    "it_tray": ("a round shallow wooden tray bon for rolling dice, top-down view" + ICON, 1024, 1024),
    "bg_track": ("a long grassy riverbank horse racing course in the japanese countryside, wooden fence along the track, pine trees and distant mountains, daytime, side view" + BG, 1344, 768),
    "ch_horse": ("a galloping horse with a samurai rider in colorful clothes, side view facing left, dynamic running pose" + CHAR, 1024, 1024),
    "it_cardback": ("the back design of an old japanese tensho karuta playing card, red and gold geometric pattern, card shape filling the frame, flat front view" + STYLE + ", no text", 768, 1024),
    "suit_sword": ("a single straight sword emblem for a karuta card suit" + ICON, 1024, 1024),
    "suit_cup": ("a single golden goblet cup emblem for a karuta card suit" + ICON, 1024, 1024),
    "suit_club": ("a single wooden club baton emblem for a karuta card suit" + ICON, 1024, 1024),
    "suit_coin": ("a single round gold coin emblem for a karuta card suit" + ICON, 1024, 1024),
}


def main():
    a = sys.argv[1:]
    seeds, base = 3, 2712
    if "--seeds" in a:
        i = a.index("--seeds"); seeds = int(a[i + 1]); del a[i:i + 2]
    if "--base" in a:
        i = a.index("--base"); base = int(a[i + 1]); del a[i:i + 2]
    out, kinds = a[0], (a[1:] or list(KINDS))
    os.makedirs(out, exist_ok=True)
    key = open(KEY_FILE, encoding="utf-8").read().strip()
    rnd = random.Random(base)
    for k in kinds:
        prompt, wd, ht = KINDS[k]
        for j in range(seeds):
            seed = rnd.randrange(1, 2**31 - 1)
            dst = os.path.join(out, f"{k}_{seed}.png")
            if os.path.exists(dst):
                print("exists:", dst); continue
            while True:
                wait_idle(key)
                try:
                    res = json.loads(req("/generate_image", key, {"prompt": prompt, "width": wd, "height": ht, "seed": seed}))
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
