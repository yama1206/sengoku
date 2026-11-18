// 2.13.0 看板娘：大きな町の茶屋に一人ずつ（2.13.1 市場から茶屋へ）。話す（1日1回）・贈り物（1日1回。好きな品だと大きく上がる）・お団子をごちそうする（親しくなってから）で仲が深まる。
//  仲がいちばん深まると想いを伝えられ、夫婦になると自宅に来てくれる（休むと傷が早く治る）。夫婦になれるのは一人だけ
(function () {
  const SIM = SGK.SIM;
  const MU = (SIM.MUSUME = { talk: 4, gift: 4, giftLike: 12, date: 10, dateCost: 500, dateNeed: 40, max: 100 });
  // 段階：0 はじめて 1 顔なじみ 2 親しい 3 想い合う 4 想いを伝えられる
  MU.stages = ['はじめて', '顔なじみ', '親しい', '想い合う', '想いを伝えられる'];
  MU.stageOf = (a) => (a >= 100 ? 4 : a >= 70 ? 3 : a >= 40 ? 2 : a >= 15 ? 1 : 0);
  // 町 → 娘。lines は段階ごとの一言（0〜4）、like は好きな品、likeT／gift は贈り物の返事、date は茶屋、yes は想いを伝えたとき、wife は夫婦になってから
  MU.girls = {
    tsushima: { type: '可愛い', name: 'お鈴', like: 'tea', shop: '茶屋', lines: ['いらっしゃいませ！津島の茶屋へようこそ。お茶、すぐお持ちしますね', 'あっ、また来てくれたんですね。お茶、淹れましょうか？', 'あなたが来ると、なんだか店が明るくなる気がします', '……今日も来てくれるかなって、ずっと戸口を見てたんです', 'あの……あなたに、聞いてほしいことがあるんです'], likeT: 'わあ、いいお茶！あなた、わたしの好きなもの覚えててくれたんですね', gift: 'ありがとうございます。大事に使いますね', date: '並んでお団子なんて、なんだか照れちゃいますね。……でも、うれしい', yes: 'はい……！ずっと、その言葉を待ってました。これからは、あなたの帰りを家で待ちますね', wife: 'おかえりなさい！お茶、淹れてありますよ' },
    kyo: { type: 'エレガント', name: '千代', like: 'cotton', shop: '呉服屋', lines: ['ようお越しやす。京のお茶で、ひと休みしていっておくれやす', 'あら、またお会いしましたなぁ。お元気そうで何より', 'あんさんと話してると、時の経つのを忘れてしまいますわ', '……ほんまは、あんさんが来はるの、毎日待ってますのえ', 'あんさんに、言いたいことがありますの。聞いてくれはります？'], likeT: 'まあ、ええ木綿。よう分かってはりますなぁ', gift: 'おおきに。気持ちがうれしゅうおす', date: '茶屋でゆっくりなんて、久しぶりどす。あんさんとやから、よけいに', yes: '……うちでよければ、喜んで。末永う、よろしゅうおたの申します', wife: 'おかえりやす。今日もご無事で、ほっとしましたえ' },
    sakai: { type: 'クール', name: 'お琴', like: 'iron', shop: '問屋', lines: ['いらっしゃい！堺の茶屋は商いの話でにぎやかやで。まあ座り', 'お、また来たな。今日は何を仕入れてくん？', 'あんた、商いの目はええな。うちと組んだら儲かるで', '……べつに、あんたが来るの待ってたわけちゃうで。ほんまやで', 'なあ、ちょっと真面目な話、してもええ？'], likeT: 'ええ鉄やん！あんた、うちの好み分かっとるなぁ', gift: 'おおきに。ちゃんと帳面につけとくわ', date: 'たまには帳場から離れるのもええな。……あんたとやからやで', yes: 'うちを選ぶなんて、あんたほんまに目が利くわ。……ずっと一緒やで', wife: 'おかえり！今日の儲けはどうやった？' },
    hakata: { type: '可愛い', name: '汐', like: 'sake', shop: '魚屋', lines: ['いらっしゃい！博多の茶屋へようこそ。お茶でも飲んでいかんね', 'あ、また来てくれたと？うれしか〜', 'あんたと話しよると、元気が出るとよ', '……海に出る船ば見るたび、あんたのこと考えよる', 'ねえ、ちょっとだけ、うちの話ば聞いてくれん？'], likeT: 'よか酒！今夜はこれで一杯やろうかね', gift: 'ありがと！大事にするけん', date: '海の見える茶屋、好いとうと。あんたと来れてよかった', yes: 'うち、あんたについていくけん！ずっとそばにおらせてね', wife: 'おかえり！今日はいい魚ば焼いとるよ' },
    shinagawa: { type: '可愛い', name: 'お花', like: 'tea', shop: '旅籠', lines: ['い、いらっしゃいませ……。お茶、お淹れしますね', 'あ……また、来てくださったんですね', 'あなたとなら、少しずつ話せるようになってきました', '……あなたの足音、もう聞き分けられるんです', 'あの……勇気を出して、言いたいことがあるんです'], likeT: 'わ……わたしの好きなお茶……。覚えていてくださったんですか', gift: 'あ、ありがとうございます……', date: 'こ、こうして並んで座ると……どきどきしますね', yes: '……はい。わたしで、よければ。ずっと、おそばに', wife: 'おかえりなさいませ。……今日も、待っていました' },
    sakata: { type: '綺麗', name: 'お稲', like: 'rice', shop: '米問屋', lines: ['ようこそ。酒田の茶屋で、旅の疲れを癒やしてくださいな', 'また来てくださいましたね。旅はいかがでした？', 'あなたのお話、もっと聞かせてくださいな', '……実りの秋みたいに、あなたへの気持ちが育っています', '今日は、わたしの気持ちを聞いてもらえますか？'], likeT: 'まあ、よいお米。あなたは本当に、わたしを分かってくださる', gift: 'ありがとうございます。うれしいです', date: '風に揺れる稲穂を眺めながらのお茶、格別ですね', yes: 'はい。あなたと、同じ田を耕すように生きていきたい', wife: 'おかえりなさい。炊きたてのご飯がありますよ' },
    niigata: { type: '綺麗', name: '小夏', like: 'sake', shop: '酒屋', lines: ['いらっしゃい！お茶もいいけど、新潟のお酒もあるよ', 'あっ、来た来た！待ってたよ〜', 'あんたと飲むお酒が、いちばんおいしいかも', '……冬が来ても、あんたがいれば寒くないなって', 'ね、今日はちょっと、まじめな話してもいい？'], likeT: 'いい酒〜！今夜は二人で飲もうよ', gift: 'ありがと！大事にするね', date: '昼間のお茶もいいね。あんたとなら、なんでも楽しい', yes: 'やった！あたし、あんたのお嫁さんになる！', wife: 'おかえり〜！お酒、温めといたよ' },
    tsuruga: { type: 'クール', name: 'お鶴', like: 'salt', shop: '船問屋', lines: ['……いらっしゃい。座るなら、そこ空いてるわよ', 'また来たの？……べつに、迷惑じゃないけど', 'あなた、意外と頼りになるのね。……少しだけ', '……来ない日は、ちょっとだけ、寂しかった。ちょっとだけよ', '……ねえ。逃げないで、聞いてくれる？'], likeT: '……塩。わたしの好きなもの、なんで知ってるのよ。……ありがと', gift: 'ふうん。……もらっておくわ', date: 'べ、べつに楽しみにしてたわけじゃ……。でも、来てよかった', yes: '……ばか。そんなの、とっくに決まってたわよ。ずっと一緒にいて', wife: '……おかえり。遅いから、心配したじゃない' },
    yamaguchi: { type: 'エレガント', name: '桜', like: 'cotton', shop: '小間物屋', lines: ['ようこそ。西の京、山口の茶屋でございます', 'またお目にかかれて、うれしゅうございます', 'あなたとのお話は、琴の音より心地よいですわ', '……あなたを想うと、胸が春のように温かくなりますの', '今日は、わたくしの心をお伝えしてもよろしいかしら'], likeT: 'まあ、美しい木綿。あなたの目利きには感心いたしますわ', gift: 'ありがとうございます。大切にいたします', date: '桜の下でのお茶会、まるで夢のようですわ', yes: 'はい……。わたくし、あなたと生涯を共にいたします', wife: 'おかえりなさいませ。今宵は一曲、お聴かせしましょうか' },
    utazu: { type: '綺麗', name: '楓', like: 'salt', shop: 'うどん屋', lines: ['いらっしゃい！お茶のあとは讃岐のうどんもどう？', 'お、また来たね！大盛りにしとこうか？', 'あんたってさ、話してて飽きないんだよね', '……あんたのぶんだけ、こっそり具を多くしてるの、気づいてた？', 'ねえ、今日はうどんの話じゃないんだけど……いい？'], likeT: 'いい塩！これでだしがもっとおいしくなるよ', gift: 'ありがと！今度なにかおごるね', date: 'たまには食べる側もいいね。あんたと一緒だと特に', yes: 'えへへ……もちろん！これからは毎日、あんたにうどん作るよ', wife: 'おかえり！今日もうどん、打っといたよ' },
  };
  MU.img = (id) => 'w_' + (({ kyo: 'yamaguchi_p2', yamaguchi: 'kyo_p2' })[id] || id + '_p2'); // 絵のファイル名（2.13.1 大人の和服の女性に描き直し。2.14.1 描き直した絵 _p2 に）
  const day = (w) => Math.floor(w.time.min / 1440);
  const here = (w, p) => (p.at && p.tx == null ? SIM.settlement(w, p.at) : null);
  const rec = (p, id) => { p.love = p.love || {}; return (p.love[id] = p.love[id] || { a: 0, t: -1, g: -1, d: -1 }); };
  const need = (w, p) => { const s = here(w, p); const g = s && MU.girls[s.id]; if (!g) { SIM.say(p.id, 'ここには看板娘はいません'); return null; } if (p.wife === s.id) { SIM.say(p.id, `${g.name}は自宅で待っています`); return null; } if (p.battle) return null; return [s, g, rec(p, s.id)]; };
  const up = (r, n) => { r.a = Math.min(MU.max, r.a + n); };
  const sayG = (p, g, t) => SIM.say(p.id, `${g.name}「${t}」`);

  SIM.commands.musume = (w, p, c) => {
    const x = need(w, p); if (!x) return; const [s, g, r] = x, d = day(w), wife = p.wife === s.id;
    const k = c && c.kind;
    if (k === 'talk') {
      if (r.t === d) return sayG(p, g, wife ? g.wife : '今日はもうたくさんお話ししましたね。また明日');
      r.t = d; up(r, MU.talk);
      return sayG(p, g, wife ? g.wife : g.lines[MU.stageOf(r.a)]);
    }
    if (k === 'gift') {
      const it = SGK.DATA.items[c.item]; if (!it || !((p.inv || {})[c.item] > 0)) return;
      if (r.g === d) return SIM.say(p.id, '贈り物は1日に1度までです');
      p.inv[c.item]--; if (!p.inv[c.item]) { delete p.inv[c.item]; if (p.cost) delete p.cost[c.item]; }
      r.g = d; const liked = c.item === g.like; up(r, liked ? MU.giftLike : MU.gift);
      return sayG(p, g, liked ? g.likeT : g.gift);
    }
    if (k === 'date') {
      if (r.a < MU.dateNeed) return SIM.say(p.id, 'もう少し親しくなってからにしましょう');
      if (r.d === d) return SIM.say(p.id, 'ごちそうは1日に1度までです');
      if (p.money < MU.dateCost) return SIM.say(p.id, `お団子の代金${SIM.money(MU.dateCost)}が足りません`);
      p.money -= MU.dateCost; r.d = d; up(r, MU.date);
      return sayG(p, g, g.date);
    }
    if (k === 'propose') {
      if (p.wife) return SIM.say(p.id, p.wife === s.id ? 'もう夫婦です' : 'あなたにはもう連れ合いがいます');
      if (r.a < MU.max) return SIM.say(p.id, 'まだ想いを伝えるには早いようです');
      p.wife = s.id; sayG(p, g, g.yes);
      return SIM.say(p.id, `${g.name}と夫婦になりました！これからは自宅で待っていてくれます（休むと傷がさらに早く治ります）`);
    }
  };
  // 本人に送る情報：いる拠点の看板娘・仲の深さ
  const basePriv = SIM.privateState;
  SIM.privateState = function (w, pid) {
    const r = basePriv.apply(this, arguments); const p = w.players[pid]; if (!r || !p || !r.me) return r;
    const wg = p.wife && MU.girls[p.wife];
    r.me.wife = wg ? { id: p.wife, img: MU.img(p.wife), name: wg.name, line: wg.wife } : null;
    if (r.here && MU.girls[r.here.id] && p.wife !== r.here.id) { // 夫婦になった娘は茶屋にはいない（自宅にいる）
      const id = r.here.id, g = MU.girls[id], q = (p.love || {})[id] || { a: 0, t: -1, g: -1, d: -1 }, d = day(w), st = MU.stageOf(q.a);
      r.here.musume = { id, img: MU.img(id), type: g.type, name: g.name, shop: g.shop, a: q.a, st, stName: MU.stages[st], like: st >= 1 ? g.like : null, talked: q.t === d, gifted: q.g === d, dated: q.d === d, wife: p.wife === id, married: !!p.wife, line: p.wife === id ? g.wife : g.lines[st] };
    }
    return r;
  };
})();
