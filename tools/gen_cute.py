"""2.13.0 人物（看板娘・市場の商人・賭場の人）を、現代風の可愛い顔だちで、服は戦国時代のもので作る。市場の背景も作る。
使い方: python tools/gen_cute.py 出力フォルダ [種類 ...] [--seeds N] [--base シードの元]
・人物は白い背景で作り、tools/cutone.py で背景を抜いて使う。背景の絵（bg_）はそのまま。
・待ち方・保存の決まりは gen_art.py と同じ（一括生成が終わるまで待つ。同じ名前があれば作らない）。
"""
import json, os, sys, random, urllib.request, urllib.error, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_ground import GW, KEY_FILE, req, wait_idle

ANIME = ", modern japanese anime illustration style, cute appealing character design, big expressive eyes, soft cel shading, clean thin lineart, high quality game character art"
PERIOD = ", wearing authentic sengoku period japanese clothing (16th century), no modern clothes"
CHAR = ANIME + PERIOD + ", upper body from the knees up, facing the viewer, isolated on a pure white background, no shadow, no text, no letters, no signboard, no props in the background, the whole figure fits inside the frame with white margin"
BG = ", modern japanese anime background art style, detailed painterly scenery, soft warm light, no people in the foreground"
GIRL = "a beautiful adult woman in her mid twenties with a mature grown-up face and adult body proportions, tall, a young woman who works at a shop in a sengoku period town, standing alone with nothing behind her, "
KIMONO = "a mature japanese woman around 28 years old wearing a kimono, clearly an adult woman not a girl, grown-up face with defined cheekbones and a slender chin, tall adult figure, standing alone, "
EMPTY = "empty hands holding nothing, no props, no objects, hands relaxed at her sides or lightly clasped in front, "
CUTE = "cute type: soft face, bright friendly eyes, small nose, rosy cheeks, sweet lovable expression, "
PRETTY = "pretty type: beautiful well balanced oval face, warm gentle almond shaped eyes, natural graceful features, "
COOL = "cool beauty type: slim sharp face, narrow sharp eyes with long lashes and slightly upturned outer corners, thin eyebrows, composed calm expression, "
ELEGANT = "elegant mature lady type: refined oval face, half lidded gentle eyes, a small beauty mark under one eye, red lips, sophisticated and alluring aura, "
KINDS = {
    # 看板娘（大きな町ごとに一人。名前と町は js/sim/musume.js）
    "m_tsushima": (GIRL + "cheerful smile, black hair in a high ponytail tied with a red cord, orange and white striped kosode kimono with tasuki sleeve cord, holding a wooden tray with tea" + CHAR, 832, 1216),
    "m_kyo": (GIRL + "elegant gentle smile, long straight black hair tied low at the back, pale purple kosode with wisteria pattern, holding a folding fan" + CHAR, 832, 1216),
    "m_sakai": (GIRL + "confident merchant daughter grin, short bob black hair with a hairpin, teal kosode with coin pattern and a dark apron maekake, holding a soroban abacus" + CHAR, 832, 1216),
    "m_hakata": (GIRL + "lively energetic smile, wavy brown hair with a white headband hachimaki, indigo kosode with light blue stripes, holding a basket of fresh fish" + CHAR, 832, 1216),
    "m_shinagawa": (GIRL + "shy blushing smile, black hair in a bun with a red kanzashi, light green kosode with small flower pattern, holding a paper lantern" + CHAR, 832, 1216),
    "m_sakata": (GIRL + "calm kind smile, long black hair in a loose braid, deep red kosode with rice plant pattern, holding a bundle of rice ears" + CHAR, 832, 1216),
    "m_niigata": (GIRL + "bright sunny smile, black hair in twin low tails, light sky blue kosode with deep blue wave pattern, holding a small sake bottle, plain empty white background" + CHAR, 832, 1216),
    "m_tsuruga": (GIRL + "cool tsundere pout, long black hair with straight bangs, navy blue kosode with a crane pattern, arms crossed" + CHAR, 832, 1216),
    "m_yamaguchi": (GIRL + "graceful refined smile, long hair with a large ribbon, pink kosode with cherry blossom pattern, holding a small koto pick" + CHAR, 832, 1216),
    "m_utazu": (GIRL + "playful wink, short black hair, yellow and brown checkered kosode with a towel on her shoulder, holding a bowl of udon noodles" + CHAR, 832, 1216),
    # 2.13.1 和服の女の子（看板娘として使う）。顔の系統を4つに分ける：可愛い・綺麗・クール・エレガント
    "w_tsushima": (KIMONO + EMPTY + CUTE + "cheerful open smile, black hair in a high ponytail tied with a red cord, orange and cream striped kimono with a tasuki sleeve cord" + CHAR, 832, 1216),
    "w_hakata": (KIMONO + EMPTY + CUTE + "energetic grin showing teeth, short wavy chestnut brown hair with a headband, indigo kimono with light blue stripes" + CHAR, 832, 1216),
    "w_shinagawa": (KIMONO + EMPTY + CUTE + "shy bashful smile with blushing cheeks, black hair in a side bun with a red kanzashi, mint green kimono with small flowers" + CHAR, 832, 1216),
    "w_sakata": (KIMONO + EMPTY + PRETTY + "soft kind smile, long black hair in a loose side braid over her shoulder, deep red kimono with golden rice ear pattern" + CHAR, 832, 1216),
    "w_niigata": (KIMONO + EMPTY + PRETTY + "bright friendly smile, shoulder length dark brown hair, sky blue kimono with deep blue wave pattern" + CHAR, 832, 1216),
    "w_utazu": (KIMONO + EMPTY + PRETTY + "playful wink and a peace of mind smile, short boyish black hair, mustard yellow and brown checkered kimono" + CHAR, 832, 1216),
    "w_sakai": (KIMONO + EMPTY + COOL + "confident sly smirk, black bob cut hair with a silver hairpin, teal kimono with a coin pattern and a dark apron" + CHAR, 832, 1216),
    "w_tsuruga": (KIMONO + EMPTY + COOL + "aloof slightly annoyed look, very long straight black hair with blunt bangs, navy blue kimono with white crane pattern" + CHAR, 832, 1216),
    "w_kyo": (KIMONO + EMPTY + ELEGANT + "serene gentle smile, long straight black hair tied low at the back, pale purple kimono with wisteria pattern" + CHAR, 832, 1216),
    "w_yamaguchi": (KIMONO + EMPTY + ELEGANT + "graceful refined smile, long black hair in an elaborate updo with hair ornaments, pink kimono with cherry blossom pattern" + CHAR, 832, 1216),
    # 市場
    "c_merchant": ("a friendly plump middle aged market merchant man with a round kind face and a small smile, sengoku period merchant kimono with a dark haori and a headband, holding a soroban abacus" + CHAR, 832, 1216),
    # 賭場（作り直し）
    "c_boss": ("a sly charming old yakuza gambling boss oyabun with white hair and a small beard, half-closed eyes, smirking, dark kimono with haori, holding a closed folding fan in one hand and resting the other hand on his knee, a few gold coins beside him" + CHAR, 832, 1216),
    "c_dealer": ("a handsome cool young tsubofuri dice dealer man with spiky black hair tied back, serious face, one shoulder bare kimono and white sarashi around his belly, a tattoo on his arm, holding up an upside-down woven rattan bowl-shaped dice cup with two white dice" + CHAR, 832, 1216),
    # 2.13.3 描き直し：胴元は見るからに年配の親分に、津島の娘はもっと大人びた顔に
    "c_boss3": ("a stout sixty year old japanese gambling boss oyabun with a weathered wrinkled face, deep smile lines and crow's feet, receding grey hair tied in a small topknot, thick grey eyebrows, a short grey beard, a shrewd knowing grin, kneeling seated seiza, dark brown kimono with a black haori, one hand on his knee and the other resting on his thigh" + CHAR, 832, 1216),
    "w_tsushima2": (KIMONO + EMPTY + CUTE + "a woman of about thirty with a mature face, gentle warm smile with closed lips, calm adult eyes, black hair in a neat high ponytail tied with a red cord, orange and cream striped kimono with a tasuki sleeve cord" + CHAR, 832, 1216),
    # 練兵所
    "c_drill": ("a handsome stern but kind samurai drill instructor in his thirties with a short topknot and a scar on his cheek, light armor do over a dark kimono, holding a wooden practice spear" + CHAR, 832, 1216),
    "bg_renpei": ("a sengoku period japanese army training ground renpeisho, packed dirt yard surrounded by a wooden fence, racks of yari spears and bows, straw archery targets, a wooden barracks building with a recruitment notice board, banners on poles, distant ashigaru practicing in the background, daytime" + BG.replace(", no people in the foreground", ", no people in the foreground, no letters on the banners"), 1344, 768),
    # 市場の背景
    "bg_street": ("a lively sengoku period japanese town street in daytime, rows of old wooden houses with thatched roofs and plank roofs, open fronts with baskets of rice, vegetables, fish and pottery on wooden benches, plain cloth curtains, townspeople in kimono walking on a dirt road, green hills and blue sky" + BG, 1344, 768),
    "bg_shop": ("interior of a sengoku period japanese merchant shop, wooden counter, shelves with rice bales, sake barrels, rolls of cloth, tea jars, earthen floor doma, noren curtain at the entrance with daylight outside" + BG, 1344, 768),
    "bg_home": ("interior of a modest but cozy sengoku period japanese house, tatami room with an irori sunken hearth with a hanging iron kettle, shoji sliding doors, a wooden chest tansu, a storage closet, warm evening light" + BG, 1344, 768),
    "bg_teahouse": ("a cozy sengoku period japanese teahouse chaya at the roadside, red felt covered bench, red parasol umbrella, tea and dango on a tray, cherry trees, warm afternoon light" + BG, 1344, 768),
}


def main():
    a = sys.argv[1:]
    seeds, base = 2, 2130
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
