// 毛利家(1560年代 中国・九州)
defineHouse('mouri','e1560w',{name:'毛利家'},mk=>{
mk('bo','u','志道広良',2,1000,3,{e:[{t:'draw',n:1}]});
mk('bo','u','宍戸隆家',2,1000,3,{k:['guard']});
mk('bo','u','福原貞俊',3,2000,2,{e:[{t:'peekDiscard'}]});
mk('bo','u','乃美宗勝',3,2000,2,{e:[{t:'tapE'}]});
mk('bo','u','熊谷信直',3,2000,2,{k:['guard']});
mk('bo','u','吉川元春',4,3000,2,{killBreak:true});
mk('bo','u','小早川隆景',4,3000,2,{e:[{t:'bounce'}]});
mk('bo','u','毛利元就【中国の覇者】',6,6000,1,{pr:['SR','SSR'],e:[{t:'tapE'},{t:'peekDiscard'}]});
mk('bo','p','妙玖',4,0,1,{ps:'sap'});
mk('bo','c','吉田郡山城',5,0,1,{ps:'kasuga'});
mk('bo','w','焙烙火矢',2,0,1,{w:{pow:1000,tie:true}});
mk('bo','x','調略',3,0,2,{e:[{t:'bounce'},{t:'draw',n:1}]});
});
