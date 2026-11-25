// 六角家（1560年代 畿内） 謀：敵を横にし、動けない武将を討つ
defineHouse('rokkaku','e1560k',{name:'六角家'},mk=>{
mk('bo','u','布施公雄',2,1000,3,{e:[{t:'tapE'}]});
mk('bo','u','平井定武',2,2000,3);
mk('bo','u','蒲生賢秀',3,2000,2,{k:['guard'],blockBonus:1000});
mk('bo','u','小倉実澄',3,2000,2,{e:[{t:'tapE'}]});
mk('bo','u','進藤賢盛',4,3000,2,{e:[{t:'kill',max:3000,tapped:true}]});
mk('bo','u','六角義治',5,4000,2,{e:[{t:'tapSkip'}]});
mk('bo','u','六角義賢【江南の守護】',6,6000,1,{pr:['SR','SSR'],e:[{t:'tapE'},{t:'kill',max:4000,tapped:true}]});
mk('bo','p','六角家の姫',4,0,1,{ps:'sap'});
mk('bo','c','観音寺城',5,0,1,{e:[{t:'shield',n:1},{t:'tapSkip'}]});
mk('bo','w','日置流の弓',2,0,1,{w:{pow:1000}});
mk('bo','w','観音寺の長槍',3,0,1,{w:{pow:1000,tie:true}});
mk('bo','x','甲賀衆の伏兵',5,0,2,{e:[{t:'tapE'},{t:'kill',max:4000,tapped:true}]});
});
