// 島津家(1560年代 中国・九州)
defineHouse('shimazu','e1560w',{name:'島津家'},mk=>{
mk('bu','u','島津家久',2,1000,3,{k:['rush']});
mk('bu','u','島津歳久',2,1000,3,{k:['rush']});
mk('bu','u','新納忠元',3,2000,2,{k:['rush']});
mk('bu','u','北郷時久',3,3000,2);
mk('bu','u','伊集院忠棟',3,2000,2,{e:[{t:'tapE'}]});
mk('bu','u','島津貴久',4,3000,2,{killBreak:true});
mk('bu','u','島津義久',4,3000,2,{e:[{t:'pumpTemp',pow:1000,kw:'rush'}]});
mk('bu','u','島津義弘【鬼島津】',6,6000,1,{pr:['SR','SSR'],k:['rush'],killBreak:true});
mk('bu','p','実窓夫人',4,0,1,{ps:'atkAura'});
mk('bu','c','内城',5,0,1,{ps:'aura'});
mk('bu','w','種子島',2,0,1,{w:{pow:1000,k:'rush'}});
mk('bu','x','釣り野伏せ',4,0,2,{e:[{t:'kill',max:5000}]});
});
