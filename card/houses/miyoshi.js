// 三好家 武: 大軍で止められず押し切る
defineHouse('miyoshi','e1560e',{name:'三好家'},mk=>{
mk('bu','u','松山重治',2,1000,3,{k:['rush']});
mk('bu','u','岩成友通',2,2000,3);
mk('bu','u','三好長逸',3,2000,2,{blockedBonus:2000});
mk('bu','u','三好政康',3,2000,2,{e:[{t:'pumpTemp',pow:2000}]});
mk('bu','u','篠原長房',4,3000,2,{noBlock:true});
mk('bu','u','安宅冬康',4,3000,2,{e:[{t:'breakS',n:1}]});
mk('bu','u','三好長慶【天下人】',6,6000,1,{pr:['SR','SSR'],noBlock:true,e:[{t:'draw',n:1},{t:'kill',max:3000}]});
mk('bu','p','澪姫',4,0,1,{ps:'deathDraw'});
mk('bu','c','飯盛城',5,0,1,{ps:'aura'});
mk('bu','w','長柄槍',2,0,1,{w:{pow:1000,tie:true}});
mk('bu','w','鉄砲',3,0,1,{w:{pow:2000}});
mk('bu','x','阿波の夜襲',5,0,2,{e:[{t:'tapE'},{t:'breakS',n:1}]});
});
