"""Extract split compositions, temporal keys and static masks from the supplied AEP.
Usage: python3 scripts/import-split-screens.py '/path/to/Split Screens KIT.aep'
Requires Pillow only when rebuilding antialiased masks; no Python needed at runtime.
"""
import sys,struct,json,pathlib,shutil
from PIL import Image,ImageDraw
source=pathlib.Path(sys.argv[1]);b=source.read_bytes()
root=pathlib.Path(__file__).resolve().parents[1];assets=root/'BACKEND/assets/split-screens';assets.mkdir(parents=True,exist_ok=True)
def parse(start,end):
 out=[];p=start
 while p+8<=end:
  tag=b[p:p+4].decode('latin1');n=struct.unpack('>I',b[p+4:p+8])[0];q=p+8
  if q+n>end:break
  d={'tag':tag}
  if tag in ('RIFX','LIST'):d.update(type=b[q:q+4].decode('latin1'),children=parse(q+4,q+n))
  else:d['raw']=b[q:q+n]
  out.append(d);p=q+n+(n%2)
 return out
def walk(ns):
 for n in ns:
  yield n
  yield from walk(n.get('children',[]))
def raw(ns,tag):return next((n['raw'] for n in ns if n['tag']==tag),b'')
def props(ns):
 out={}
 for n in walk(ns):
  ch=n.get('children',[])
  for i,d in enumerate(ch[:-1]):
   if d['tag']=='tdmn':out[d['raw'].rstrip(b'\0').decode()]=ch[i+1]
 return out
def doubles(b):return list(struct.unpack('>'+str(len(b)//8)+'d',b[:len(b)//8*8]))
tree=parse(0,len(b));comps={}
for n in walk(tree):
 ch=n.get('children',[]);cd=raw(ch,'cdta')
 if cd:comps[int.from_bytes(raw(ch,'idta')[16:20],'big')]={'name':raw(ch,'Utf8').decode(),'size':list(struct.unpack('>HH',cd[140:144])),'node':n}
def layer(n,owner,label):
 ch=n['children'];sid=int.from_bytes(raw(ch,'ldta')[40:44],'big');src=comps.get(sid)
 if not src or src['name']=='Colors':return None
 ps=props(ch);w,h=src['size']
 result={'size':[w,h],'anchor':[w/2,h/2],'scale':[1,1],'position':[owner[0]/2,owner[1]/2]}
 for prop,key in [('ADBE Anchor Point','anchor'),('ADBE Scale','scale'),('ADBE Position','position')]:
  if prop not in ps:continue
  flat=list(walk([ps[prop]]));cd=raw(flat,'cdat')
  if cd:result[key]=doubles(cd)[:2]
  data=raw(flat,'ldat')
  if prop=='ADBE Position' and data:
   assert len(data)==256
   result['keys']=[]
   for k in (data[:128],data[128:]):
    v=doubles(k[16:]);result['keys'].append({'t':int.from_bytes(k[:4],'big')/24000,'speed':v[0],'influenceIn':v[2],'influenceOut':v[4],'position':v[5:7]})
   result['position']=result['keys'][-1]['position']
 if 'ADBE Mask Shape' in ps:
  flat=list(walk([ps['ADBE Mask Shape']]));header=raw(flat,'shph');data=raw(flat,'ldat');bounds=struct.unpack('>ffff',header[4:20]);points=list(struct.iter_unpack('>ff',data));verts=[]
  # AE stores vertex/outgoing/incoming-next triplets around a closed Bezier path.
  controls=[[(bounds[0]+x*(bounds[2]-bounds[0]))*w,(bounds[1]+y*(bounds[3]-bounds[1]))*h] for x,y in points]
  for i in (0,3,6,9):verts.append(controls[i])
  outline=[]
  for i in (0,3,6,9):
   a,c,d,z=[controls[j%12] for j in (i,i+1,i+2,i+3)]
   for step in range(64):
    t=step/64;outline.append([a[k]*(1-t)**3+3*c[k]*(1-t)**2*t+3*d[k]*(1-t)*t*t+z[k]*t**3 for k in (0,1)])
  svg='M '+','.join(map(str,controls[0]))+' '+ ' '.join('C '+' '.join(','.join(map(str,controls[j%12])) for j in (i+1,i+2,i+3)) for i in (0,3,6,9))+' Z'
  invert=bool(raw(list(walk(ch)),'mkif')[0]);result['mask']={'points':verts,'svgPath':svg,'invert':invert,'file':label+'.png'}
  # Fourfold rasterization gives smooth diagonal edges at both preview and export sizes.
  im=Image.new('L',(w*4,h*4),255 if invert else 0);ImageDraw.Draw(im).polygon([(x*4,y*4) for x,y in outline],fill=0 if invert else 255)
  im.resize((w,h),Image.Resampling.LANCZOS).save(assets/(label+'.png'))
 if ' Comp ' in src['name']:
  children=[l for l in src['node']['children'] if l.get('type')=='Layr'];assert len(children)==1
  result['child']=layer(children[0],src['size'],label+'-inner')
 else:result['slot']=int(src['name'].split()[-1])-1
 return result
out=[]
for c in comps.values():
 if not c['name'].startswith('Screen '):continue
 num=int(c['name'].split()[-1]);layers=[]
 for i,n in enumerate(c['node']['children']):
  if n.get('type')=='Layr':
   l=layer(n,c['size'],f'screen-{num:02}-{i}')
   if l:layers.append(l)
 out.append({'sourceScreen':num,'layers':layers})
out.sort(key=lambda c:-c['sourceScreen'])
(root/'SHARED/split-screen-motion.mjs').write_text('// Generated from the bundled AEP by scripts/import-split-screens.py.\nexport const splitScreenMotion='+json.dumps(out,separators=(',',':'))+';\n')
shutil.copy2(source,assets/'source.aep')
print('Imported',len(out),'compositions;',len(list(assets.glob('*.png'))),'masks')
