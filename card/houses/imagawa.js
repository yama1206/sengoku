// 今川家
defineHouse('imagawa','e1560',{name:'今川家'},mk=>{
mk('so','u','今川氏真',2,1000,3,{e:[{t:'draw',n:1}]});
mk('so','u','鵜殿長照',2,1000,3,{k:['guard']});
mk('so','u','岡部元信',3,2000,2,{surviveShield:true});
mk('so','u','朝比奈泰朝',3,3000,2);
mk('so','u','松井宗信',3,2000,2,{k:['rush']});
mk('so','u','関口親永',4,3000,2,{noBlock:true});
mk('so','u','太原雪斎',4,3000,2,{e:[{t:'draw',n:1},{t:'shield',n:1}]});
mk('so','u','今川義元',6,6000,1,{pr:['SR','SSR'],e:[{t:'killAll',max:2000}]});
mk('so','p','寿桂尼',4,0,1,{ps:'drawStart'});
mk('so','c','今川館',4,0,1,{ps:'deathDraw'});
mk('so','w','海道の弓',2,0,1,{w:{pow:1000,drawAtk:true}});
mk('so','x','駿河の備え',3,0,2,{e:[{t:'shield',n:2},{t:'draw',n:1}]});
});
