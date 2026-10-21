import {profileFontMetrics} from './profile-font-metrics.mjs';
const description='Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
const specs=[
 ['circle','Circle','MODULAR','PRESENTATION','01',[120,110,860,860], [1100,310,650,110,100],[1100,420,650,65,52],[1090,505,690,235,42]],
 ['organic','Organic','SMOOTH','ANIMATION','04',[105,85,850,875],[1100,310,650,110,100],[1100,420,650,65,52],[1090,505,690,235,42]],
 ['hexagon','Hexagon','4K RESOLUTION','','06',[140,82,820,912],[1070,375,650,80,74],null,[1090,465,610,175,40]],
 ['portrait','Portrait','ALEXANDRA NEAL','','14',[742,137,436,436],[350,610,1220,75,58],null,[230,695,1460,220,43]]
];
export const PROFILE_STYLES=specs.map(([key,name,text,eyebrow,sourceSlide])=>({id:`profile_${key}`,category:'opener',collection:'profile',profile:true,name,sourceSlide,description:`${name==='Portrait'?'Centered portrait with a name and biography':name+' media frame beside a title and description'}. Inspired by Modular Presentation.`,bg:'#ffffff',fg:'#3d4252',accent:'#3868bb',colorControl:true,colors:[['accentColor','Accent','#3868bb'],['banner2Color','Secondary','#60bfdc'],['textColor','Text','#3d4252']],fields:[{key:'text',label:name==='Portrait'?'Name / title':'Title',maxLength:600,placeholder:text},...(eyebrow?[{key:'eyebrow',label:'Subtitle',maxLength:50,placeholder:eyebrow}]:[]),{key:'text2',label:'Description',maxLength:400,placeholder:'Introduce your story.'},{key:'title',label:'Corner label (optional)',maxLength:100,placeholder:`Slide ${sourceSlide}`}],sample:{text,eyebrow,text2:description,title:`Slide ${sourceSlide}`}}));
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const n=x=>Number(x.toFixed(3));
const ease=x=>1-(1-Math.max(0,Math.min(1,x)))**4;
function fit(value,spec,key){
 if(!spec||!String(value||'').trim())return null;
 const [x,y,w,h,max]=spec,heading=key==='text'||key==='eyebrow',content=heading?String(value).toUpperCase():String(value),metrics=profileFontMetrics[heading?'title':'body'];let size=max,lines=[];
 const measure=s=>Array.from(s).reduce((sum,c)=>sum+(metrics[c.codePointAt(0)]??.7)*size,0);
 do{lines=[];for(const para of content.split('\n')){let line='';for(const word of para.split(/\s+/).filter(Boolean)){if(line&&measure(line+' '+word)>w){lines.push(line);line='';}if(measure(word)>w){for(const char of word){if(line&&measure(line+char)>w){lines.push(line);line='';}line+=char;}}else line=line?line+' '+word:word;}lines.push(line);}if(lines.length*size*1.18<=h)break;size--;}while(size>2);
 return {key,x,y,w,h,fontSize:size,lineHeight:size*1.18,lines,heading};
}
export function profileLayout(style,values={}){
 const spec=specs.find(row=>style.id===`profile_${row[0]}`);if(!spec)throw new Error('Unknown profile style.');
 const color=(key,fallback)=>/^#[\da-f]{6}$/i.test(values[key]||'')?values[key]:fallback;
 return {...style,kind:spec[0],accent:color('accentColor',style.accent),secondary:color('banner2Color','#60bfdc'),textColor:color('textColor',style.fg),label:String(values.title||''),panels:[{box:spec[5]}],blocks:[fit(values.text,spec[6],'text'),fit(values.eyebrow,spec[7],'eyebrow'),fit(values.text2,spec[8],'text2'),fit(values.title,[190,spec[0]==='portrait'?55:985,260,45,32],'title')].filter(Boolean),shapes:[]};
}
function shape(kind,attrs=''){
 if(kind==='circle')return `<circle cx="550" cy="540" r="430" ${attrs}/>`;
 if(kind==='portrait')return `<circle cx="960" cy="355" r="218" ${attrs}/>`;
 if(kind==='hexagon')return `<path d="M550 82C610 82 905 252 931 304C970 380 970 704 935 772C899 837 608 994 550 994C490 994 198 837 162 772C129 704 129 380 166 304C192 252 490 82 550 82Z" ${attrs}/>`;
 return `<path d="M140 350C196 219 600 57 797 88C983 117 973 451 920 669C882 832 810 1000 649 946C391 860 32 594 140 350Z" ${attrs}/>`;
}
export function profileMarkup(d,time=3,duration=8,id='profile',placeholder=false){
 const uid=escape(id),speed=Math.min(1,duration/4),t=time/speed,arrival=ease(t/.9),reveal=ease((t-.3)/1.25),cx=d.kind==='portrait'?960:550,cy=d.kind==='portrait'?355:540;
 const transform=`translate(${cx} ${cy}) scale(${n(reveal)}) translate(${-cx} ${-cy})`;
 let svg=`<defs><linearGradient id="${uid}-color" x2="1" y2="1"><stop stop-color="${d.accent}"/><stop offset="1" stop-color="${d.secondary}"/></linearGradient><mask id="${uid}-mask"><rect width="1920" height="1080" fill="white"/>${shape(d.kind,`fill="black" transform="${transform}"`)}</mask><clipPath id="${uid}-clip">${shape(d.kind)}</clipPath></defs>`;
 if(placeholder){const r=d.kind==='portrait'?218:430;svg+=`<rect width="1920" height="1080" fill="#bbc6cf"/><circle cx="${cx}" cy="${cy-r*.38}" r="${r*.28}" fill="#8e9eaa"/><path d="M${cx-r*.75} ${cy+r}V${cy+r*.45}Q${cx-r*.75} ${cy} ${cx} ${cy}Q${cx+r*.75} ${cy} ${cx+r*.75} ${cy+r*.45}V${cy+r}Z" fill="#8e9eaa"/>`;}
 svg+=`<g mask="url(#${uid}-mask)"><rect width="1920" height="1080" fill="#fff"/>`;
 if(d.kind==='circle')svg+=`<rect x="234" y="30" width="300" height="1020" fill="${d.secondary}" transform="translate(0 ${n((1-arrival)*-1100)})"/>`;
 svg+=shape(d.kind,`fill="url(#${uid}-color)" transform="translate(${cx} ${cy}) scale(${n(arrival)}) translate(${-cx} ${-cy})"`)+ '</g>';
 if(d.kind==='organic')svg+=shape(d.kind,`fill="none" stroke="url(#${uid}-color)" stroke-width="32" transform="rotate(9 550 540)" opacity="${n(reveal)}"`);
 svg+=shape(d.kind,`fill="none" stroke="url(#${uid}-color)" stroke-width="${d.kind==='portrait'?18:32}" transform="${transform}"`)+shape(d.kind,`fill="none" stroke="white" stroke-width="3" transform="${transform}"`);
 svg+=`<g clip-path="url(#${uid}-clip)" opacity="${n(.1*reveal)}"><path d="M0 400L920 -180H1130L0 610Z" fill="white"/></g>`;
 for(const b of d.blocks){const label=b.key==='title',p=ease((t-(label?.2:b.key==='text2'?1.15:.85))/.7),dy=label?0:(1-p)*35;let x=b.x+b.w/2,y=b.y;
 if(label){x=d.kind==='portrait'?190:1715;y=d.kind==='portrait'?58:992;}
 svg+=`<g opacity="${n(p)}" transform="translate(0 ${n(dy)})">`;
 if(d.kind==='hexagon'&&b.key==='text2')svg+=`<rect x="1070" y="455" width="650" height="215" fill="${d.secondary}"/>`;
 b.lines.forEach((line,i)=>svg+=`<text x="${x}" y="${n(y+b.fontSize*.88+i*b.lineHeight)}" font-family="${b.heading?'Multicolore Pro':'Montserrat'}" font-weight="${b.heading?400:500}" font-size="${b.fontSize}" text-anchor="${label?(d.kind==='portrait'?'start':'end'):'middle'}" fill="${b.key==='eyebrow'||d.kind==='portrait'&&b.key==='text'?`url(#${uid}-color)`:d.kind==='hexagon'&&b.key==='text2'?'white':d.textColor}">${escape(line)}</text>`);
 if(label)svg+=`<rect x="${d.kind==='portrait'?70:1730}" y="${y-5}" width="114" height="38" fill="${d.secondary}"/>`;svg+='</g>';}
 const outro=ease((time-duration+.55*speed)/(.55*speed));if(outro>0)svg+=`<rect width="1920" height="1080" fill="white" opacity="${n(outro)}"/>`;
 return svg;
}
export const profileSvg=(d,t,duration,w=1920,h=1080)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1920 1080">${profileMarkup(d,t,duration)}</svg>`;
