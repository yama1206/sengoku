// 長宗我部家 創: 一領具足の安い突撃と武器の使い回し
defineHouse('chosokabe','e1560e',{name:'長宗我部家'},mk=>{
mk('so','u','吉田重俊',2,1000,3,{k:['rush']});
mk('so','u','福留儀重',2,1000,3,{k:['rush']});
mk('so','u','比江山親興',3,2000,2,{e:[{t:'drawWeapon'}]});
mk('so','u','谷忠澄',3,2500,2,{e:[{t:'drawIfFewer'}]});
mk('so','u','吉良親貞',4,3000,2,{k:['rush']});
mk('so','u','香宗我部親泰',5,4000,2,{k:['rush']});
mk('so','u','長宗我部元親【土佐の出来人】',6,7000,1,{pr:['SR','SSR'],k:['rush'],e:[{t:'drawWeapon',discount:1}]});
mk('so','p','養甫尼',3,0,1,{ps:'rushDraw'});
mk('so','c','岡豊城',4,0,1,{ps:'weaponGuard'});
mk('so','w','一領具足の槍',3,0,1,{w:{randomKillMax:2000}});
mk('so','w','一領具足の鍬',2,0,1,{w:{k:'rush',tie:true}});
mk('so','x','一領具足の夜討',4,0,2,{e:[{t:'kill',max:3000},{t:'draw',n:1}]});
});
