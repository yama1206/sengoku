// 上杉家
defineHouse('uesugi','e1560',{name:'上杉家'},mk=>{
mk('gi','u','斎藤朝信',1,500,3,{k:['guard']});
mk('gi','p','綾姫',4,0,1,{ps:'refill'});
mk('gi','u','色部勝長',2,1000,3,{k:['guard'],blockBonus:2000});
mk('gi','u','本庄繁長',3,2000,2,{k:['guard'],blockBonus:1000});
mk('gi','u','中条藤資',3,2000,2,{k:['guard']});
mk('gi','u','上杉憲政',3,2000,2,{e:[{t:'shield',n:1}]});
mk('gi','u','直江景綱',4,3000,2,{guardAtk:true});
mk('gi','u','上杉政虎【関東管領】',6,6000,1,{pr:['SR','SSR'],k:['double'],e:[{t:'draw',n:1},{t:'shield',n:1}]});
mk('gi','c','厩橋城',5,0,1,{ps:'guardAura'});
mk('gi','w','越後の長柄',2,0,1,{w:{k:'guard',tie:true}});
mk('gi','x','関東管領就任',4,0,2,{e:[{t:'shield',n:2}]});
mk('gi','x','小田原城包囲',5,0,2,{e:[{t:'tapAll'}]});
});
