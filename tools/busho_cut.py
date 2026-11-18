"""2.14.0 gen_busho.py で描いた武将の絵を切り抜いて assets/busho/ に置き、js/data/bushoart.js の一覧に足す。
使い方: python tools/busho_cut.py tools/busho/家.json 描いた絵のフォルダ [--skip 名前,名前,...]
・1人につき一番新しく描いた絵を使う。すでに一覧にある人は飛ばす（描き直した人は一覧から外してから）
・置くファイルは assets/busho/b_<ハッシュ>.png（あれば _2, _3 … と新しい名前にする。上書きしない）
・一覧は tools/busho/art.json（名前 → ファイル名）。ここから js/data/bushoart.js を作り直す
"""
import json, os, sys, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_busho import key

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "tools", "busho", "art.json")
JS = os.path.join(ROOT, "js", "data", "bushoart.js")
SIZE = 560


def write_js(art):
    body = ",\n".join(f"    {json.dumps(n, ensure_ascii=False)}: '{f}'" for n, f in sorted(art.items(), key=lambda x: x[1]))
    open(JS, "w", encoding="utf-8", newline="\n").write(
        "// 2.14.0 武将の立ち絵：絵のある武将の名前 → assets/busho/ のファイル名（tools/busho_cut.py が tools/busho/art.json から作る。手で直さない）\n"
        "(function () {\n  const ART = {\n" + body + "\n  };\n"
        "  SGK.bushoImg = (name) => (name && ART[name] ? `assets/busho/${ART[name]}.png` : null);\n"
        "  SGK.bushoCount = () => Object.keys(ART).length;\n})();\n")


def main():
    a = sys.argv[1:]; skip = set()
    if "--skip" in a: i = a.index("--skip"); skip = set(a[i + 1].split(",")); del a[i:i + 2]
    fam = json.load(open(a[0], encoding="utf-8")); raw = a[1]
    art = json.load(open(ART, encoding="utf-8")) if os.path.exists(ART) else {}
    os.makedirs(os.path.join(ROOT, "assets", "busho"), exist_ok=True)
    files = os.listdir(raw)
    for p in fam["people"]:
        n = p["name"]
        if n in art or n in skip: continue
        k = key(n); c = [f for f in files if f.startswith(f"b_{k}_")]
        if not c: print("no picture:", n); continue
        src = max((os.path.join(raw, f) for f in c), key=os.path.getmtime)
        stem = f"b_{k}"; j = 2
        while os.path.exists(os.path.join(ROOT, "assets", "busho", stem + ".png")): stem = f"b_{k}_{j}"; j += 1
        r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "cutone.py"), src, os.path.join(ROOT, "assets", "busho", stem + ".png"), "--size", str(SIZE), "--person"], capture_output=True, text=True)
        if r.returncode: print("cut failed:", n, r.stderr[-300:]); continue
        art[n] = stem; print("ok:", n, stem, flush=True)
        json.dump(art, open(ART, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    write_js(art)
    print("total", len(art))


if __name__ == "__main__":
    main()
