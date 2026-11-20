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

# 2.14.0 厚塗り（武将と同じ絵柄）。a_〇〇 は w_〇〇 の絵柄だけを替えたもの
ATSU = ", semi-realistic painterly digital painting, thick brush strokes, detailed beautiful realistic adult face with natural skin, soft warm lighting, like a japanese historical strategy game character portrait illustration"
CHAR_ATSU = CHAR.replace(ANIME, ATSU)
for _k in [k for k in KINDS if k.startswith("w_")]:
    _p, _w, _h = KINDS[_k]
    KINDS["a_" + _k[2:]] = (_p.replace(CHAR, CHAR_ATSU), _w, _h)
# 2.14.0 写真っぽすぎたので絵らしく。ポーズも一人ずつ変える（p_〇〇）
PAINT = ", painterly illustration like a japanese historical strategy game character portrait, semi-realistic but clearly a hand painted illustration and not a photo, visible thick brush strokes, slightly stylized beautiful features, rich warm colors"
CHAR_PAINT = CHAR.replace(ANIME, PAINT)
POSE = {
    "tsushima2": "one hand lightly touching her ponytail, the other hand at her side, body slightly turned, ",
    "kyo": "standing gracefully in a three-quarter view, one hand gently holding the sleeve of the other arm, ",
    "sakai": "arms loosely crossed, weight on one leg, head slightly tilted, ",
    "hakata": "both hands on her hips, leaning forward a little with energy, ",
    "shinagawa": "both hands held shyly at her chest, glancing sideways, ",
    "sakata": "hands resting together on her obi, a slight bow of the head, ",
    "niigata": "one hand raised in a small friendly wave, ",
    "tsuruga": "looking back over her shoulder at the viewer, body turned to the side, ",
    "yamaguchi": "one hand lightly touching her hair ornament, elegant posture, ",
    "utazu": "hands clasped behind her back, leaning slightly to one side, ",
}
for _id, _pose in POSE.items():
    _p, _w, _h = KINDS["w_" + _id]
    KINDS["p_" + _id] = (_p.replace(EMPTY, "empty hands holding nothing, no props, " + _pose).replace(CHAR, CHAR_PAINT), _w, _h)
# 2.14.1 p_ は全員同じ「手を前で組む」立ち方になった。ポーズを文の先頭に置き、正面向きの指定も外す（q_〇〇）
CHAR_POSE = CHAR_PAINT.replace("upper body from the knees up, facing the viewer", "figure from the knees up, dynamic natural pose")
POSE2 = {
    "tsushima2": "POSE: she raises one hand high above her head waving cheerfully, the other hand on her hip",
    "kyo": "POSE: she lifts her long kimono sleeve with one hand to hide her mouth, body turned three-quarters to the side, eyes smiling at the viewer",
    "sakai": "POSE: arms crossed firmly over her chest, weight on one hip, head tilted with a sly look",
    "hakata": "POSE: both fists pumped up in front of her chest, leaning forward with energy, laughing",
    "shinagawa": "POSE: both palms pressed together in front of her lips, shoulders hunched shyly, looking up at the viewer",
    "sakata": "POSE: she bends forward in a polite bow with both hands resting on her knees, face lifted to look at the viewer",
    "niigata": "POSE: one arm stretched out toward the viewer with an open palm as if inviting them in, the other hand on her chest",
    "tsuruga": "POSE: body turned completely sideways, looking back over her shoulder at the viewer, one hand on her obi",
    "yamaguchi": "POSE: one hand raised to touch the ornament in her hair, the other arm across her waist, elegant s-curve posture, body turned to the side",
    "utazu": "POSE: both hands behind her head with elbows out, relaxed and leaning, weight on one leg",
}
for _id, _pose in POSE2.items():
    _p, _w, _h = KINDS["w_" + _id]
    _p = _p.replace(EMPTY, "").replace(CHAR, CHAR_POSE)
    KINDS["q_" + _id] = (_pose + ". " + _p + ". " + _pose, _w, _h)
# 2.14.2 背景がアニメ調なので娘もアニメ調に。採用した絵と同じシードで、絵柄だけアニメに戻す（ポーズを保つため）
#   a_〇〇 の絵 → w_〇〇（もともとアニメ調）、p_〇〇 の絵 → n_〇〇（p_ のポーズのままアニメ調）
for _id in POSE:
    _p, _w, _h = KINDS["p_" + _id]
    KINDS["n_" + _id] = (_p.replace(CHAR_PAINT, CHAR), _w, _h)
# 2.14.2 アニメ調でも手を前で組む子が多かった。ポーズを文の先頭と末尾に置き、構図（頭から膝まで）も全員そろえる（r_〇〇）
FRAME_KNEE = "framed from the top of her head down to just below her knees, the same distance and size for every character, natural pose"
CHAR_R = CHAR.replace("upper body from the knees up, facing the viewer", FRAME_KNEE)
POSE3 = dict(POSE2, sakata="POSE: she rests one hand against her cheek with her head tilted, the other hand hanging relaxed at her side")
for _id, _pose in POSE3.items():
    _p, _w, _h = KINDS["w_" + _id]
    _p = _p.replace(EMPTY, "").replace(CHAR, CHAR_R)
    KINDS["r_" + _id] = (_pose + ". " + _p + ". " + _pose, _w, _h)
# 2.14.2 宇多津はもう少し若く、ポーズも別に（ru1・ru2 の2案）
_p = KINDS["r_utazu"][0].split(". ", 1)[1].rsplit(". ", 1)[0].replace("a mature japanese woman around 28 years old", "a young japanese woman around 21 years old, youthful fresh face,").replace("grown-up face with defined cheekbones and a slender chin, tall adult figure", "young adult face, slender figure")
for _k, _pose in {"ru1_utazu": "POSE: she points one finger playfully at the viewer, the other hand on her hip, leaning slightly forward",
                  "ru2_utazu": "POSE: she leans forward with both hands resting on her knees, smiling up at the viewer"}.items():
    KINDS[_k] = (_pose + ". " + _p + ". " + _pose, 832, 1216)

# 2.54.0 壺振り・胴元（親分）・市場の商人をリアル寄りに描き直す（x_〇〇）。人の顔・肌・布の質感は写実的に、でも絵として描いたもの
REAL = ", semi-realistic painted portrait, realistic human face and proportions with natural skin texture and real wrinkles, realistic fabric folds, painterly brush strokes, cinematic warm lighting, like a high quality japanese historical drama game character illustration, not anime, not a photo"
CHAR_REAL = CHAR.replace(ANIME, REAL)
# 2.55.0 豪商（大きな町）・豪商の店・湊の背景
KINDS["c_gosho"] = ("a wealthy dignified japanese great merchant in his fifties, calm shrewd confident smile, neat grey hair in a small topknot, luxurious dark green silk kimono under a fine black haori, standing upright, one hand holding a closed folding fan" + CHAR, 832, 1216)
KINDS["bg_gosho"] = ("interior of a wealthy sengoku period japanese great merchant house showroom, polished wooden floor and tatami, lacquered shelves with precious tea jars and tea bowls, hanging ink scrolls, a gold folding screen, thick white plaster storehouse door kura in the back, soft afternoon light" + BG, 1344, 768)
KINDS["bg_minato"] = ("a busy 16th century japanese harbor town in daytime, wooden piers, in the bay only old wooden sailing ships: a large wooden chinese junk with brown batten sails and a tall wooden 16th century portuguese carrack with a high curved stern and square sails, small wooden japanese rowing boats, porters carrying straw bales and wooden crates, old warehouses with tiled roofs, blue sea and green hills" + BG, 1344, 768)
for _k in ("c_dealer", "c_boss3", "c_merchant", "c_gosho"):
    _p, _w, _h = KINDS[_k]
    KINDS["x_" + _k[2:]] = (_p.replace(CHAR, CHAR_REAL).replace("handsome cool young", "lean sharp-eyed man in his late twenties, a"), _w, _h)


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
    # 種類:シード と書くと、そのシードで1枚だけ作る（2.14.2 絵柄だけ替えて描き直す用）
    jobs = []
    for k in kinds:
        if ":" in k:
            k, s = k.split(":"); jobs.append((k, int(s)))
        else:
            jobs += [(k, rnd.randrange(1, 2**31 - 1)) for _ in range(seeds)]
    for k, seed in jobs:
        prompt, wd, ht = KINDS[k]
        if True:
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
