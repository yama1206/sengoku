import json, math, sys
T = json.load(open('/tmp/geo/land/japan.topojson'))
tr = T.get('transform'); arcs=[]
for a in T['arcs']:
    pts=[];x=y=0
    for p in a:
        if tr: x+=p[0]; y+=p[1]; pts.append((x*tr['scale'][0]+tr['translate'][0], y*tr['scale'][1]+tr['translate'][1]))
        else: pts.append(tuple(p))
    arcs.append(pts)
cnt=[0]*len(arcs)
def walk(g):
    t=g['type']
    if t=='GeometryCollection':
        for x in g['geometries']: walk(x)
    elif t=='Polygon':
        for r in g['arcs']:
            for i in r: cnt[i if i>=0 else ~i]+=1
    elif t=='MultiPolygon':
        for p in g['arcs']:
            for r in p:
                for i in r: cnt[i if i>=0 else ~i]+=1
for o in T['objects'].values(): walk(o)
coast=[arcs[i] for i in range(len(arcs)) if cnt[i]==1]
# chain
key=lambda p:(round(p[0],6),round(p[1],6))
from collections import defaultdict
ends=defaultdict(list)
for k,a in enumerate(coast): ends[key(a[0])].append(k); ends[key(a[-1])].append(k)
used=[False]*len(coast); rings=[]
for k in range(len(coast)):
    if used[k]: continue
    used[k]=True; ring=list(coast[k])
    while key(ring[-1])!=key(ring[0]):
        nxt=None
        for j in ends[key(ring[-1])]:
            if not used[j]: nxt=j;break
        if nxt is None: break
        used[nxt]=True; a=coast[nxt]
        if key(a[0])==key(ring[-1]): ring+=a[1:]
        else: ring+=a[::-1][1:]
    rings.append(ring)
LON0,LAT0=129.4,41.6
def xy(p): return ((p[0]-LON0)*91,(LAT0-p[1])*111)
def area(r):
    s=0
    for i in range(len(r)):
        x1,y1=r[i-1];x2,y2=r[i];s+=x1*y2-x2*y1
    return abs(s)/2
def dp(pts,eps):
    if len(pts)<3: return pts
    import sys
    sys.setrecursionlimit(100000)
    keep=[False]*len(pts);keep[0]=keep[-1]=True
    st=[(0,len(pts)-1)]
    while st:
        a,b=st.pop();ax,ay=pts[a];bx,by=pts[b];dx,dy=bx-ax,by-ay;L=math.hypot(dx,dy) or 1e-9
        m=-1;md=0
        for i in range(a+1,b):
            px,py=pts[i];d=abs(dy*(px-ax)-dx*(py-ay))/L if (dx or dy) else math.hypot(px-ax,py-ay)
            if d>md: md=d;m=i
        if md>eps: keep[m]=True; st+=[(a,m),(m,b)]
    return [p for p,k in zip(pts,keep) if k]
W,H=1165,1188
eps=float(sys.argv[1]) if len(sys.argv)>1 else 0.6
minA=float(sys.argv[2]) if len(sys.argv)>2 else 15
out=[];tot=0
for r in rings:
    P=[xy(p) for p in r]
    A=area(P)
    if A<minA: continue
    cx=sum(p[0] for p in P)/len(P); cy=sum(p[1] for p in P)/len(P)
    if not(0<=cx<=W and 0<=cy<=H): continue
    # split closed ring for dp: use two halves
    n=len(P); h=n//2
    S=dp(P[:h+1],eps)[:-1]+dp(P[h:]+[P[0]],eps)[:-1]
    if len(S)<4: continue
    out.append({'A':round(A),'cx':round(cx),'cy':round(cy),'lat':round(LAT0-cy/111,2),'lon':round(LON0+cx/91,2),'pts':[[round(x,1),round(y,1)] for x,y in S]})
    tot+=len(S)
out.sort(key=lambda o:-o['A'])
json.dump(out,open('/tmp/work/lands.json','w'))
print(len(rings),'rings ->',len(out),'kept, pts',tot)
for o in out: print(o['A'],o['lat'],o['lon'],len(o['pts']))
