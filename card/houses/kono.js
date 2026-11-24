// 河野家(1560年代 四国・奥羽・北陸) 義: 水軍で追い返し、堅く守る
defineHouse('kono','e1560e',{name:'河野家'},mk=>{
mk('gi','u','平岡房実',2,1000,3,{k:['guard']});
mk('gi','u','重見通種',2,2000,3);
mk('gi','u','得能通綱',3,1500,2,{e:[{t:'bounce'}]});
mk('gi','u','大野直之',3,2000,2,{k:['guard'],blockBonus:500});
mk('gi','u','来島通康',4,3000,2,{e:[{t:'tapSkip'}]});
mk('gi','u','村上武吉',5,4000,2,{k:['guard'],blockBonus:1000});
mk('gi','u','河野通宣【伊予の名門】',6,6000,1,{pr:['SR','SSR'],k:['guard'],e:[{t:'shield',n:1},{t:'bounce'}]});
mk('gi','p','鶴姫',3,0,1,{ps:'guardAura'});
mk('gi','c','湯築城',4,0,1,{e:[{t:'shield',n:1},{t:'draw',n:1}]});
mk('gi','w','水軍の櫂',2,0,1,{w:{pow:1000,k:'guard'}});
mk('gi','w','村上の焙烙玉',3,0,1,{w:{tie:true}});
mk('gi','x','水軍の夜襲',5,0,2,{e:[{t:'shield',n:2},{t:'tapE'}]});
});
