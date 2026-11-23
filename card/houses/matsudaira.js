// 松平家(1560年代 桶狭間と関東)
defineHouse('matsudaira','e1560',{name:'松平家'},mk=>{
mk('ni','u','阿部正勝',2,1000,3,{e:[{t:'draw',n:1}]});
mk('ni','u','平岩親吉',2,1000,3,{k:['guard']});
mk('ni','u','石川数正',3,2000,2,{e:[{t:'draw',n:1}]});
mk('ni','u','大久保忠世',3,2000,2,{k:['rush']});
mk('ni','u','服部半蔵',3,2000,2,{e:[{t:'tapE'}]});
mk('ni','u','鳥居元忠',4,3000,2,{k:['guard'],deathRamp:true});
mk('ni','u','酒井忠次',5,4000,2,{e:[{t:'kill',max:3000}]});
mk('ni','u','松平元康',6,6000,1,{pr:['SR','SSR'],k:['guard'],blockBonus:1000,e:[{t:'shield',n:1}]});
mk('ni','p','築山殿',3,0,1,{ps:'hatsu'});
mk('ni','c','岡崎城',5,0,1,{ps:'guardAll'});
mk('ni','w','厭離穢土の旗',2,0,1,{w:{pow:1000,k:'guard'}});
mk('ni','x','大高城兵糧入れ',3,0,2,{e:[{t:'ramp',n:1},{t:'draw',n:1}]});
});
