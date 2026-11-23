// 蘆名家(1560年代 四国・奥羽・北陸) 謀: 守を崩し、手札を見て謀略をかける
defineHouse('ashina','e1560e',{name:'蘆名家'},mk=>{
mk('bo','u','平田舜範',2,1000,3,{k:['guard']});
mk('bo','u','松本氏輔',2,2000,3);
mk('bo','u','猪苗代盛国',3,2000,2,{e:[{t:'killGuard'}]});
mk('bo','u','佐瀬種常',3,2000,2,{e:[{t:'bounce'}]});
mk('bo','u','富田氏実',4,3000,2,{e:[{t:'peekDiscard'}]});
mk('bo','u','金上盛備',4,3000,2,{e:[{t:'kill',max:3000,tapped:true}]});
mk('bo','u','蘆名盛氏【会津の主】',6,6000,1,{pr:['SR','SSR'],e:[{t:'killGuard'},{t:'tapE'}]});
mk('bo','p','彦姫',4,0,1,{ps:'sap'});
mk('bo','c','黒川城',5,0,1,{ps:'kasuga'});
mk('bo','w','会津の長槍',2,0,1,{w:{pow:1000,tie:true}});
mk('bo','w','会津の強弓',3,0,1,{w:{pow:1000,drawAtk:true}});
mk('bo','x','会津の謀略',5,0,2,{e:[{t:'bounce'},{t:'discard',n:1}]});
});
