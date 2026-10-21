import {presentationFontMetrics} from './presentation-font-metrics.mjs';
const body='Lorem ipsum is simply dummy text of the printing and typesetting industry. Lorem ipsum has been the industry’s standard dummy text ever since the 1500s.';
// Layout coordinates measured against the supplied 1920×1080 Corporate Trend preview.
const layouts=[
 ['Modern Corporate','MODERN\nCORPORATE',[100,345,700,185,82],[100,535,685,210,29],'right'],
 ['Innovative','WE ARE\nINNOVATIVE',[1180,480,670,190,82],[1180,660,680,220,29],'left'],
 ['Classic Presentation','CLASSIC\nPRESENTATION',[230,280,900,180,82],[230,480,730,215,29],'full'],
 ['Video Tutorial','VIDEO\nTUTORIAL',[995,795,740,130,66],[995,930,730,115,23],'duo'],
 ['Minimal Design','MINIMAL\nDESIGN',[105,345,680,190,82],[105,540,680,215,29],'right'],
 ['Color Control','COLOR CONTROL\nPROVIDED',[1190,475,650,190,76],[1190,665,650,215,29],'left'],
 ['Visual Appealing','VISUAL APPEALING',[140,90,1640,145,116],null,'bottom'],
 ['Your Story','ADD YOUR TEXT\nAS YOU WANT',[100,200,690,160,70],[100,390,640,225,29],'diagonal'],
 ['Easy to Customize','EASY TO\nCUSTOMIZE',[1170,115,665,150,75],[1170,280,650,185,26],'mosaic'],
 ['Multipurpose','MULTIPURPOSE\nPRESENTATION',[1000,585,780,180,74],[1000,770,740,220,28],'full'],
 ['Corporate Trend','CORPORATE TREND',[170,430,1580,175,120],[395,730,1130,140,22],'end']
];
export const PRESENTATION_STYLES=layouts.map(([name,text],i)=>({id:`presentation_${String(i+1).padStart(2,'0')}`,category:'opener',collection:'presentation',presentation:true,name,description:'Animated Corporate Trend presentation with editable text, accent color and image or clip.',bg:'#7400ff',fg:'#ffffff',accent:'#9300ff',colorControl:true,colors:[['accentColor','Accent','#9300ff'],['textColor','Text','#ffffff']],fields:[{key:'text',label:'Title',maxLength:600,placeholder:text},...(i===6?[]:[{key:'text2',label:'Description',maxLength:400,placeholder:'Tell your story.'}]),...(i===10?[{key:'eyebrow',label:'Small heading',maxLength:50,placeholder:'MODERN · TRENDY · CLASSIC'}]:[])],sample:{text,text2:i===6?'':body,eyebrow:i===10?'MODERN · TRENDY · CLASSIC':''}}));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const clamp=n=>Math.max(0,Math.min(1,n));
const ease=n=>1-(1-clamp(n))**4;
const num=n=>Number(n.toFixed(3));
const panels={
 right:[{box:[740,0,1180,1080],path:'M1120 -80H2020V1180H1270L790 1000Q665 950 720 810Z'}],
 left:[{box:[0,0,1140,1080],path:'M-100 -80H900L1085 45Q1180 125 1140 280L960 1180H-100Z'}],
 full:[{box:[125,70,1670,940],path:'M200 70H1690Q1795 70 1795 180V890Q1795 1010 1670 1010H245Q125 1010 125 890V190Q125 70 200 70Z'}],
 duo:[{box:[0,0,1100,1050],path:'M-100 -80H1130L910 945Q885 1060 760 1035L-80 850Z'},{box:[1010,0,910,790],path:'M1240 -80H2020V850L1115 660Q980 635 1020 500Z'}],
 bottom:[{box:[110,350,1700,730],path:'M255 350H1640Q1790 350 1800 465V990Q1800 1120 1660 1120H250Q105 1120 105 990V490Q105 350 255 350Z'}],
 diagonal:[{box:[925,0,995,715],path:'M1190 -80H2020V620Q2020 760 1870 730L1000 375Q875 325 925 195Z'},{box:[650,520,1160,560],path:'M975 550L1710 855Q1840 910 1790 1050L1720 1180H550L790 605Q835 495 975 550Z'}],
 mosaic:[{box:[0,0,1100,1020],path:'M-90 -80H1170L950 890Q915 1045 775 1010L-90 790Z'},{box:[1000,565,920,515],path:'M1170 575L2020 790V1180H890L1000 700Q1030 550 1170 575Z'}],
 end:[]
};
function linesFor(content,size,width,weight){
 const metrics=presentationFontMetrics[weight],measure=s=>Array.from(s).reduce((v,c)=>v+(metrics[c.codePointAt(0)]??.65)*size+size*.025,0);const lines=[];
 for(const p of String(content).toUpperCase().split('\n')){
  let line='';
  for(const word of p.split(/\s+/).filter(Boolean)){
   if(line&&measure(line+' '+word)>width){lines.push(line);line='';}
   if(measure(word)>width){for(const char of word){if(line&&measure(line+char)>width){lines.push(line);line='';}line+=char;}}
   else line=line?line+' '+word:word;
  }
  lines.push(line);
 }
 return {lines,measure};
}
function block(content,spec,key,center=false){if(!spec||!String(content||'').trim())return null;const [x,y,w,h,max]=spec,weight=key==='text'?'Black':'Bold';let size=max,result;do{result=linesFor(content,size,w,weight);if(result.lines.length*size*1.05<=h)break;size--;}while(size>2);return {key,x,y,w,h,size,fontSize:size,lineHeight:size*1.05,weight,lines:result.lines,center};}
export function presentationLayout(style,values={}){
 const index=Number(style.id.slice(-2))-1,def=layouts[index];if(!def)throw new Error('Unknown presentation style.');
 const accent=/^#[0-9a-f]{6}$/i.test(values.accentColor||'')?values.accentColor:style.accent;
 return {...style,accent,textColor:/^#[0-9a-f]{6}$/i.test(values.textColor||'')?values.textColor:'#ffffff',index,kind:def[4],panels:panels[def[4]],blocks:[block(values.text,def[2],'text',index===6||index===10),block(values.text2,def[3],'text2',index===10),index===10?block(values.eyebrow,[390,265,1140,70,24],'eyebrow',true):null].filter(Boolean),shapes:[]};
}
export function presentationMarkup(d,time=3,duration=8,id='presentation',placeholder=false){
 const speed=Math.min(1,duration/4),t=time/speed,end=1,intro=ease(t/1.05),shift=(1-intro)*(d.kind==='left'?-380:380);
 const prefix=esc(id),color=d.accent;
 const windows=d.panels.map(p=>`<path d="${p.path}" transform="translate(${num(shift)} 0)"/>`).join('');
 let svg=`<defs><linearGradient id="${prefix}-bg" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="${color}"/></linearGradient><linearGradient id="${prefix}-shade" x2="1" y2=".8"><stop stop-color="#fff" stop-opacity=".13"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient><mask id="${prefix}-holes"><rect width="1920" height="1080" fill="white"/><g fill="black">${windows}</g></mask></defs>`;
 if(placeholder)svg+='<rect width="1920" height="1080" fill="#83909d"/><path d="M0 1000L650 180 1100 760 1510 260 1920 870V1080H0Z" fill="#667485"/><circle cx="1440" cy="230" r="95" fill="#abb6bf"/>';
 svg+=`<g opacity="${num(end)}"><g mask="url(#${prefix}-holes)"><rect width="1920" height="1080" fill="url(#${prefix}-bg)" fill-opacity=".92"/><rect width="1920" height="1080" fill="url(#${prefix}-shade)"/>`;
 // The source's drifting, rounded diagonal tiles and fine technical marks.
 for(let i=0;i<4;i++){const x=[-240,1180,380,1650][i]+Math.sin(time*.22+i)*22,y=[50,-420,900,870][i];svg+=`<rect x="${num(x)}" y="${y}" width="${i%2?660:420}" height="${i%2?660:420}" rx="65" fill="${i%2?'#fff':'#000'}" opacity="${i%2?.07:.1}" transform="rotate(-28 ${num(x+220)} ${y+220})"/>`;}
 for(let i=0;i<10;i++)svg+=`<path d="M${100+i*177} ${160+(i%4)*220}h${12+i%3*10}" stroke="white" opacity=".12" stroke-width="2"/>`;
 svg+='</g>';
 svg+=`<g fill="none" stroke="#f6f5f8" stroke-width="18" opacity="${num(intro)}">${windows}</g>`;
 if(d.kind==='full')svg+=`<path d="M90 0H240L210 115Q195 150 165 135Z M1820 790L1920 770V1030L1800 910Q1760 850 1820 790Z" fill="${color}"/>`;
 if(d.kind==='full')svg+=`<path d="${d.panels[0].path}" fill="#061024" opacity=".25"/>`;
 for(const b of d.blocks){const progress=ease((t-(b.key==='text'?0.55:1.05))/.85),dy=(1-progress)*65;svg+=`<g opacity="${num(progress)}" transform="translate(0 ${num(dy)})">`;b.lines.forEach((line,i)=>{svg+=`<text x="${b.center?b.x+b.w/2:b.x}" y="${num(b.y+b.size*.86+i*b.size*1.05)}" font-family="Presentation ${b.weight}" font-size="${b.size}" letter-spacing="${num(b.size*.025)}" fill="${d.textColor}" text-anchor="${b.center?'middle':'start'}">${esc(line)}</text>`;});svg+='</g>';}
 if([0,1,3,5,7].includes(d.index)){const b=d.blocks.find(b=>b.key==='text');if(b)svg+=`<rect x="${b.x}" y="${b.y-70}" width="${num(260*ease((t-.3)/.65))}" height="24" fill="${d.textColor}"/>`;}
 svg+=`<g transform="translate(${d.kind==='left'?1690:160} 950) skewX(-16)" fill="white" opacity="${num(.75*intro)}"><rect width="22" height="48" opacity=".45"/><rect x="29" width="22" height="48"/><rect x="58" width="22" height="48" opacity=".25"/></g><rect x="5" y="5" width="1910" height="1070" fill="none" stroke="#fff" stroke-width="10"/></g>`;
 // A diagonal white sweep introduces/closes each scene like the reference transitions.
 const wipe=t<.7?1-ease(t/.7):time>duration-.55*speed?ease((time-duration+.55*speed)/(.55*speed)):0;
 if(wipe>0)svg+=`<path d="M-400 -200H${num(2320*wipe)}L${num(2320*wipe-380)} 1280H-400Z" fill="#f8f7fa"/>`;
 return svg;
}
export const presentationSvg=(d,t,duration,w=1920,h=1080)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1920 1080">${presentationMarkup(d,t,duration)}</svg>`;
