// 最上家(1560年代 四国・奥羽・北陸) 義: 延沢の剛力と守り、城門の補充
defineHouse('mogami','e1560e',{name:'最上家'},mk=>{
mk('gi','u','志村光安',2,1000,3,{k:['guard']});
mk('gi','u','谷柏直家',2,2000,3);
mk('gi','u','延沢満延',3,2000,2,{k:['rush']});
mk('gi','u','楯岡満英',3,2000,2,{k:['guard'],blockBonus:1000});
mk('gi','u','上山満兼',3,2000,2,{e:[{t:'draw',n:1}]});
mk('gi','u','氏家守棟',4,3000,2,{surviveShield:true});
mk('gi','u','最上義守【羽州探題】',6,6000,1,{pr:['SR','SSR'],k:['guard'],blockBonus:2000,e:[{t:'shield',n:2}]});
mk('gi','p','永浦尼',4,0,1,{ps:'guardAll'});
mk('gi','c','山形城',5,0,1,{ps:'refill'});
mk('gi','w','最上の長槍',2,0,1,{w:{pow:1000,tie:true}});
mk('gi','w','出羽の強弓',2,0,1,{w:{pow:1000,k:'guard'}});
mk('gi','x','出羽の夜襲',4,0,2,{e:[{t:'shield',n:1},{t:'tapE'}]});
});
