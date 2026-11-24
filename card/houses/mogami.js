// 佐竹家（関東・甲斐） 義: 守りと城門の補充。札IDと旧セーブのため内部識別子は mogami。
defineHouse('mogami','e1560e',{name:'佐竹家'},mk=>{
mk('gi','u','小野崎通兼',2,1000,3,{k:['guard']});
mk('gi','u','小貫頼央',2,2000,3);
mk('gi','u','真壁久幹',3,2000,2,{k:['rush']});
mk('gi','u','佐竹義昭',3,2000,2,{k:['guard'],blockBonus:1000});
mk('gi','u','岡本禅哲',3,2000,2,{e:[{t:'draw',n:1}]});
mk('gi','u','和田昭為',4,3000,2,{surviveShield:true});
mk('gi','u','佐竹義重【鬼義重】',6,6000,1,{pr:['SR','SSR'],k:['guard'],blockBonus:2000,e:[{t:'shield',n:2}]});
mk('gi','p','伊達晴宗の娘',4,0,1,{ps:'guardAll'});
mk('gi','c','太田城',5,0,1,{ps:'refill'});
mk('gi','w','佐竹の長槍',2,0,1,{w:{pow:1000,tie:true}});
mk('gi','w','常陸の強弓',2,0,1,{w:{pow:1000,k:'guard'}});
mk('gi','x','常陸の夜襲',4,0,2,{e:[{t:'shield',n:1},{t:'tapE'}]});
});
