// 河野家 耐: 水軍で追い返し、堅く守る
defineHouse('kono','e1560e',{name:'河野家',idIdeology:'gi'},mk=>{
mk('ni','u','平岡房実',2,1000,3,{k:['guard']});
mk('ni','u','重見通種',2,2000,3);
mk('ni','u','得能通綱',3,1500,2,{e:[{t:'bounce'}]});
mk('ni','u','大野直之',3,2000,2,{k:['guard'],blockBonus:500});
mk('ni','u','来島通康',4,3000,2,{e:[{t:'tapSkip'}]});
mk('ni','u','村上武吉',5,4000,2,{k:['guard'],blockBonus:1000});
mk('ni','u','河野通宣【伊予の名門】',6,6000,1,{pr:['SR','SSR'],k:['guard'],e:[{t:'shield',n:1},{t:'bounce'}]});
mk('ni','p','鶴姫',3,0,1,{ps:'guardAura'});
mk('ni','c','湯築城',4,0,1,{e:[{t:'shield',n:1},{t:'draw',n:1}]});
mk('ni','w','水軍の櫂',2,0,1,{w:{pow:1000,k:'guard'}});
mk('ni','w','村上の焙烙玉',3,0,1,{w:{tie:true}});
mk('ni','x','水軍の夜襲',5,0,2,{e:[{t:'shield',n:1}]});
});
