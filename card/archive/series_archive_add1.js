// 退避した「追加弾」25枚(v0.4〜0.5)。時代別パックに使うときは、シリーズIDと名前を変え、末尾に {era:'時代名'} を付けて series/ に置く。
// 例: defineSeries('era1','戦国前期',mk=>{ ... },{era:'戦国前期'});
defineSeries('add1','追加弾',mk=>{
// 創
mk('so','u','前田利家',3,3000,2,{e:[{t:'drawIfFewer'}]});
mk('so','u','蒲生氏郷',4,4000,2,{e:[{t:'retWeapon'}]});
mk('so','p','茶々',4,0,1,{ps:'chacha'});
mk('so','c','大坂城',6,0,1,{e:[{t:'draw',n:2},{t:'toMana'}]});
mk('so','w','三段撃ち',3,0,1,{w:{pow:1000,drawAtk:true}});
// 義
mk('gi','u','甘粕景持',3,2000,2,{k:['guard'],blockBonus:2000});
mk('gi','u','村上義清',4,4000,2,{k:['guard'],surviveShield:true});
mk('gi','p','春日局',4,0,1,{ps:'kasuga'});
mk('gi','c','七尾城',5,0,1,{ps:'guardAura'});
mk('gi','w','長柄槍',2,0,1,{w:{k:'guard',tie:true}});
// 武
mk('bu','u','加藤清正',4,3000,2,{e:[{t:'pumpTemp',pow:1000,kw:'rush'}]});
mk('bu','u','福島正則',5,5000,2,{k:['rush'],killBreak:true});
mk('bu','p','小松姫',3,0,1,{ps:'rushDraw'});
mk('bu','c','甲州流築城',4,0,1,{ps:'atkAura'});
mk('bu','x','騎馬突撃',2,0,2,{e:[{t:'pumpTemp',pow:2000,kw:'rush'}]});
// 謀
mk('bo','u','宇喜多直家',4,2000,2,{e:[{t:'peekDiscard'}]});
mk('bo','u','吉川元春',4,3000,2,{e:[{t:'kill',max:4000,tapped:true}]});
mk('bo','p','ねね',3,0,1,{ps:'nene'});
mk('bo','c','月山富田城',5,0,1,{ps:'gateLimit'});
mk('bo','x','偽報',2,0,2,{e:[{t:'tapE'}]});
// 忍
mk('ni','u','本多正信',3,2000,2,{e:[{t:'ramp',n:1}]});
mk('ni','u','鳥居元忠',4,3000,2,{k:['guard'],deathRamp:true});
mk('ni','p','初',3,0,1,{ps:'hatsu'});
mk('ni','c','駿府城',5,0,1,{ps:'deathDraw'});
mk('ni','x','影縫い',2,0,2,{e:[{t:'tapSkip'}]});
});
