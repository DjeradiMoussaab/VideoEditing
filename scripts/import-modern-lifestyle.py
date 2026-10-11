"""Import selected Premiere animation data and optimize bundled effect footage.
Usage: python3 scripts/import-modern-lifestyle.py '/path/to/Modern Lifestyle'
Needs Python 3 and FFmpeg. Does not require Premiere or read external instructions.
"""
import base64, gzip, hashlib, json, pathlib, shutil, subprocess, sys, xml.etree.ElementTree as ET
root=pathlib.Path(__file__).resolve().parents[1]
source=pathlib.Path(sys.argv[1]); project=source/'01. Project file/Modern Lifestyle.prproj'; footage=project.parent/'(Footage)'
out=root/'BACKEND/assets/modern-lifestyle'; out.mkdir(parents=True,exist_ok=True)
r=ET.fromstring(gzip.decompress(project.read_bytes())); objs={e.get('ObjectID') or e.get('ObjectUID'):e for e in r if e.get('ObjectID') or e.get('ObjectUID')}
T=254016000000
seqs={e.findtext('Name'):e for e in r.findall('Sequence')}
def params(chain):
 effects={}
 for c in objs[chain].findall('.//Components/Component'):
  e=objs[c.get('ObjectRef')]; ps={}
  for p in e.findall('.//Params/Param'):
   x=objs[p.get('ObjectRef')]; name=x.findtext('Name')
   if name:ps[name]={k.tag:(k.text or '').strip() for k in x if k.tag in ['StartKeyframe','Keyframes','StartKeyframeValue']}
  effects[e.findtext('Component/DisplayName')]=ps
 return effects

def tracks(name):
 result=[]
 for g in seqs[name].findall('TrackGroups/TrackGroup/Second'):
  group=objs[g.get('ObjectRef')]
  if group.tag!='VideoTrackGroup':continue
  for tr in group.findall('TrackGroup/Tracks/Track'):
   track=objs[tr.get('ObjectURef')]
   for it in track.findall('ClipTrack/ClipItems/TrackItems/TrackItem'):
    ci=objs[it.get('ObjectRef')].find('ClipTrackItem');sub=objs[ci.find('SubClip').get('ObjectRef')];clip=objs[sub.find('Clip').get('ObjectRef')]
    result.append(dict(name=sub.findtext('Name'),start=float(ci.findtext('TrackItem/Start'))/T,inPoint=float(clip.findtext('Clip/InPoint') or 0)/T,effects=params(ci.find('ComponentOwner/Components').get('ObjectRef'))))
 return result

def curve(param,offset=0):
 rows=(param.get('Keyframes') or param['StartKeyframe']).strip(';').split(';');out=[]
 for row in rows:
  v=row.split(',');value=[float(n) for n in v[1].split(':')]
  out.append(dict(t=max(0,float(v[0])/T-offset),v=value,bezier=v[2]=='5',inSpeed=float(v[4]),influenceIn=float(v[5]),outSpeed=float(v[6]),influenceOut=float(v[7])))
 return out

def fixed(p):return [float(x) for x in p['StartKeyframe'].split(',')[1].split(':')]
result={}
for n in [1,3,4,10]:
 layers=[]
 for layer in tracks(f'Scene {n}'):
  if not (layer['name'].startswith('Text') or layer['name']=='Line Color'):continue
  motion=layer['effects']['Motion'];transform=layer['effects']['Transform']
  row=dict(name=layer['name'],start=layer['start'],position=fixed(motion['Position']),scale=fixed(motion.get('Scale',motion.get('Scale Height')))[0]/100,scaleX=fixed(motion['Scale Width'])[0]/100,move=curve(transform['Position'],layer['inPoint']),opacity=curve(transform['Opacity'],layer['inPoint']))
  if layer['name'].startswith('Text'):
   text=tracks(layer['name'])[0]['effects']['Text'];doc=json.loads(base64.b64decode(text['Source Text']['StartKeyframeValue'])[8:].decode('utf-16-le').rstrip('\0'))['mTextParam']
   group=objs[seqs[layer['name']].findall('TrackGroups/TrackGroup/Second')[1].get('ObjectRef')]
   row.update(size=[int(x) for x in group.findtext('FrameRect').split(',')[2:]],textPosition=fixed(text['Position']),textScale=fixed(text['Scale'])[0]/100,text=doc)
  else:row['size']=[1920,1080]
  layers.append(row)
 image=tracks(f'Image {n} Precomp')[0]['effects']['Motion']
 result[str(n)]=dict(duration=10 if n==10 else 241/30,layers=layers,imageMove=curve(image['Position']),imageScale=curve(image['Scale']))
(root/'SHARED/modern-lifestyle-motion.mjs').write_text('// Extracted from the supplied Premiere project by scripts/import-modern-lifestyle.py.\nexport const lifestyleMotion = '+json.dumps(result,separators=(',',':'))+';\n')
shutil.copyfile(project,out/'source.prproj')
shutil.copyfile(footage/'Drop zone.jpg',out/'placeholder.jpg')
shutil.copyfile(root/'BACKEND/assets/typography-titles/OFL.txt',out/'OFL.txt')
provenance={}
def ff(args):subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*args],check=True)
for n in [1,3,4,10]:
 for original,output in [(f'Mt {n}.mov',f'matte-{n}.mkv'),(f'Glow {n}.mov',f'glow-{n}.mkv')]:
  file=footage/original
  pixel=subprocess.check_output(['ffmpeg','-v','error','-i',str(file),'-vf','crop=2:2:0:0,format=rgb24','-frames:v','1','-f','rawvideo','-'])
  red=pixel[0]
  ff(['-i',str(file),'-map','0:v:0','-vf',f"format=rgb24,extractplanes=r,lutyuv=y='clip((val-{red})*255/{255-red},0,255)'",'-an','-c:v','ffv1','-level','3',str(out/output)])
  provenance[output]=dict(source=original,sha256=hashlib.sha256(file.read_bytes()).hexdigest(),blackRed=red)
for original,output in [('Overlay.mov','texture.mp4'),('Bokeh & LEak.mov','atmosphere.mp4')]:
 ff(['-i',str(footage/original),'-map','0:v:0','-an','-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(out/output)])
 provenance[output]=dict(source=original,sha256=hashlib.sha256((footage/original).read_bytes()).hexdigest())
shutil.copyfile(footage/'Vignette.png',out/'vignette.png')
(out/'sources.json').write_text(json.dumps(provenance,indent=2)+'\n')
print('Imported scenes 1, 3, 4 and 10 with original keyframes and effect footage.')
