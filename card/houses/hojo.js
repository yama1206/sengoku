// 北条家(1560年代 桶狭間と関東)
defineHouse('hojo','e1560',{name:'北条家'},mk=>{
mk('bo','u','風魔小太郎',2,1000,3,{e:[{t:'tapE'}]});
mk('bo','u','大道寺政繁',2,1000,3,{k:['guard']});
mk('bo','u','北条氏政',3,2000,2,{e:[{t:'draw',n:1}]});
mk('bo','u','北条幻庵',3,2000,2,{e:[{t:'peekDiscard'}]});
mk('bo','u','遠山綱景',3,2000,2,{k:['guard']});
mk('bo','u','松田憲秀',4,3000,2,{e:[{t:'kill',max:4000,tapped:true}]});
mk('bo','u','北条綱成',4,3000,2,{k:['guard'],blockBonus:2000});
mk('bo','u','北条氏康',6,6000,1,{pr:['SR','SSR'],k:['guard'],e:[{t:'draw',n:1},{t:'discard',n:1}]});
mk('bo','p','瑞渓院',4,0,1,{ps:'nene'});
mk('bo','c','小田原城',5,0,1,{ps:'gateLimit'});
mk('bo','w','黄八幡の旗',2,0,1,{w:{pow:1000,tie:true}});
mk('bo','x','河越夜戦',3,0,2,{e:[{t:'tapSkip'}]});
});
