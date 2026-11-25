// 織田家
defineHouse('oda','e1560',{name:'織田家'},mk=>{
mk('so','u','木下藤吉郎',2,1000,3,{e:[{t:'draw',n:1}]});
mk('so','u','丹羽長秀',4,3000,2,{e:[{t:'draw',n:1}]});
mk('so','u','佐久間盛重',2,1000,3,{k:['guard']});
mk('so','u','毛利新助',2,1000,3,{k:['rush']});
mk('so','u','服部小平太',3,2000,2,{e:[{t:'tapE'}]});
mk('so','u','池田恒興',3,2000,2,{k:['rush']});
mk('so','u','柴田勝家',5,4000,2,{attackUnitBonus:2000});
mk('so','u','織田信長【桶狭間】',6,6000,1,{pr:['SR','SSR'],k:['rush'],e:[{t:'kill',max:3000}]});
mk('so','p','帰蝶',4,0,1,{ps:'rampStart',rampTurns:3});
mk('so','c','清洲城',5,0,1,{ps:'aura'});
mk('so','w','三間槍',2,0,1,{w:{pow:1000,tie:true}});
mk('so','x','田楽狭間の強襲',5,0,2,{e:[{t:'kill',tapped:true}]});
});
