// 浅井家（1560年代 畿内） 武：先駆けで城門を破り、戦線を維持する
defineHouse('azai','e1560k',{name:'浅井家'},mk=>{
mk('bu','u','遠藤直経',2,1000,3,{k:['rush']});
mk('bu','u','海北綱親',2,2000,3);
mk('bu','u','赤尾清綱',3,2000,2,{k:['guard'],blockBonus:1000});
mk('bu','u','雨森清貞',3,2000,2,{k:['rush']});
mk('bu','u','浅井久政',4,3000,2,{e:[{t:'shield',n:1}]});
mk('bu','u','磯野員昌',5,4000,2,{k:['rush'],attackUnitBonus:1000});
mk('bu','u','浅井長政【江北の若鷹】',6,6000,1,{pr:['SR','SSR'],k:['rush','double']});
mk('bu','p','お市の方',4,0,1,{ps:'rushDraw'});
mk('bu','c','小谷城',5,0,1,{ps:'atkAura'});
mk('bu','w','江北の長槍',2,0,1,{w:{pow:1000,k:'rush'}});
mk('bu','w','小谷の大身槍',3,0,1,{w:{pow:2000}});
mk('bu','x','野良田の逆襲',5,0,2,{e:[{t:'tapE'},{t:'pumpTemp',pow:2000},{t:'breakS',n:1}]});
});
