// 朝倉家(1560年代 四国・奥羽・北陸) 耐: 一乗谷の富で兵糧を増やし、じっくり戦う
defineHouse('asakura','e1560e',{name:'朝倉家'},mk=>{
mk('ni','u','山崎吉家',2,1000,3,{k:['rush']});
mk('ni','u','魚住景固',2,1500,3,{e:[{t:'drawLowHand'}]});
mk('ni','u','朝倉景連',3,2000,2,{e:[{t:'ramp',n:1}]});
mk('ni','u','前波吉継',3,1000,2,{e:[{t:'draw',n:2}]});
mk('ni','u','朝倉景健',4,3000,2,{e:[{t:'shield',n:1}]});
mk('ni','u','朝倉景鏡',4,3000,2,{k:['guard'],untapAfterBlock:true});
mk('ni','u','朝倉義景【一乗谷の主】',6,7000,1,{pr:['SR','SSR'],e:[{t:'graveDraw',n:2}]});
mk('ni','p','小少将',4,0,1,{ps:'shieldStart'});
mk('ni','c','一乗谷城',3,0,1,{ps:'graveStart'});
mk('ni','w','越前の長槍',2,0,1,{w:{k:'guard',tie:true}});
mk('ni','w','一乗谷の弓',3,0,1,{w:{powPerShield:1000}});
mk('ni','x','越前の守り',3,0,2,{e:[{t:'shield',n:1},{t:'ramp',n:1}]});
});
