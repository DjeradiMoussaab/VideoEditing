import {typographyMetrics} from './typography-metrics.mjs';

export function typographyLayout(style,values) {
  const split=style.id==='typography_split';
  const textColor=values.textColor||(split?style.accent:'#ffffff');
  const text=String(values.text||'').trim().toUpperCase().replace(/\r\n?/g,'\n');
  const selected=new Set(String(values.highlightWords??style.highlightWords).split(',').map(Number));
  const measure=text=>Array.from(text).reduce((n,c)=>n+(typographyMetrics[c.codePointAt(0)]??.7),0);
  const maxWidth=split?900:1600,maxHeight=split?760:800;
  // Respect intentional line breaks before introducing automatic word wrapping.
  const widestParagraph=Math.max(1,...text.split('\n').map(measure));
  let size=text.includes('\n')?Math.min(100,Math.max(36,Math.floor(maxWidth/widestParagraph))):100,rows=[];
  for(;size>=1;size--){
    rows=[];
    for(const paragraph of text.split('\n')){
      let row=[];
      for(const word of paragraph.split(/\s+/).filter(Boolean)){
        if(row.length&&measure([...row,word].join(' '))*size>maxWidth){rows.push(row);row=[];}
        row.push(word);
      }
      if(row.length)rows.push(row);
    }
    if(rows.length*size*1.14<=maxHeight&&rows.every(row=>measure(row.join(' '))*size<=maxWidth))break;
  }
  const lineHeight=size*1.14,top=split?160:(1080-rows.length*lineHeight)/2;
  const blocks=[],shapes=[];let index=0;
  for(const [line,row] of rows.entries()){
    let x=split?112:(1920-measure(row.join(' '))*size)/2;
    for(const word of row){
      const width=measure(word)*size,highlight=selected.has(++index),y=top+line*lineHeight;
      const delay=(index-1)*Math.min(.23,2.5/Math.max(1,text.split(/\s+/).length));
      if(highlight)shapes.push({x:x-4,y:y+size*.08,w:width+8,h:size*.85,color:split?'#ffffff':style.accent,stroke:0,delay:delay+.2});
      blocks.push({key:`word-${index}`,lines:[word],x,y,w:width,fontSize:size,lineHeight,color:highlight?'#000000':textColor,initialColor:textColor,align:'left',font:'montserratBlack',bold:true,delay,highlight});
      x+=width+measure(' ')*size;
    }
  }
  return {...style,shapes,blocks,width:1920,height:1080};
}
