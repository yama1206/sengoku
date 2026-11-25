// 伊達家 謀: 外交で相手の手札と動きを崩す
defineHouse('date','e1560e',{name:'伊達家'},mk=>{
mk('bo','u','伊達実元',2,1000,3,{e:[{t:'discard',n:1}]});
mk('bo','u','亘理元宗',2,2000,3);
mk('bo','u','中野宗時',3,2000,2,{e:[{t:'discard',n:1}]});
mk('bo','u','鬼庭良直',3,2000,2,{e:[{t:'bounce'}]});
mk('bo','u','大条実頼',4,2000,2,{e:[{t:'tapSkip'}]});
mk('bo','u','遠藤基信',4,3000,2,{e:[{t:'peekDiscard'}]});
mk('bo','u','伊達輝宗【出羽の外交】',6,6000,1,{pr:['SR','SSR'],e:[{t:'discard',n:1},{t:'tapSkip'}]});
mk('bo','p','義姫',4,0,1,{ps:'drawStart'});
mk('bo','c','米沢城',5,0,1,{ps:'drawWhenAhead'});
mk('bo','w','馬上槍',2,0,1,{w:{pow:1000,k:'guard'}});
mk('bo','w','奥州の強弓',3,0,1,{w:{pow:2000}});
mk('bo','x','伊達の夜討',4,0,2,{e:[{t:'tapSkip'}]});
});
