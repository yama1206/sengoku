// 能登畠山家 耐: 七尾の堅城と、倒れても残る備え
defineHouse('hatakeyama','e1560e',{name:'能登畠山家'},mk=>{
mk('ni','u','飯川光誠',2,1000,3,{k:['guard']});
mk('ni','u','三宅長盛',2,1000,3,{deathRamp:true});
mk('ni','u','温井景隆',3,2000,2,{e:[{t:'tapSkip'}]});
mk('ni','u','温井総貞',3,2000,2,{deathRamp:true});
mk('ni','u','遊佐続光',4,3000,2,{e:[{t:'peekDiscard'}]});
mk('ni','u','長続連',4,3000,2,{surviveShield:true});
mk('ni','u','畠山義綱【能登の守護】',6,6000,1,{pr:['SR','SSR'],k:['guard'],e:[{t:'ramp',n:1},{t:'shield',n:1}]});
mk('ni','p','乃々姫',4,0,1,{ps:'refill'});
mk('ni','c','七尾城',5,0,1,{ps:'gateLimit'});
mk('ni','w','七尾の長槍',2,0,1,{w:{pow:1000,tie:true}});
mk('ni','w','能登の強弓',3,0,1,{w:{pow:2000,tie:true}});
mk('ni','x','能登の内紛',4,0,2,{e:[{t:'tapE'},{t:'shield',n:1}]});
});
