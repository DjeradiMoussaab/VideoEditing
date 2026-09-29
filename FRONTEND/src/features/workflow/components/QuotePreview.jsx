import { quoteComposition } from '../../../../../SHARED/quote-styles.mjs';

export function QuotePreview({ styleId, values, animated = false, label = 'Quote preview' }) {
  const design=quoteComposition(styleId,values);
  return <svg className={`quote-design-preview ${animated?'is-animated':''}`} viewBox="0 0 1920 1080" role="img" aria-label={label}>
    <rect width="1920" height="1080" fill={design.bg}/>
    {design.id==='typography_focus'&&<image href="/typography-background-1.jpg" width="1920" height="1080" preserveAspectRatio="xMidYMid slice" style={{filter:'blur(12px) brightness(.65) grayscale(1)'}}/>}
    {design.id==='typography_split'&&<svg x="1088" width="832" height="1080" viewBox="0 0 832 1080" overflow="hidden"><image href="/typography-background-2.jpg" width="832" height="1080" preserveAspectRatio="xMidYMid slice" style={{filter:'grayscale(1) brightness(.9)'}}/></svg>}
    {design.id==='modern_clean'&&<image style={{filter:"blur(24px) brightness(0.65) saturate(0.65)"}} href="/modern-clean-background.jpg" width="1920" height="1080" preserveAspectRatio="xMidYMid slice"/>}
    {design.shapes.map((shape,i)=><rect key={i} x={shape.x} y={shape.y} width={shape.w} height={shape.h} fill={shape.stroke?'none':shape.color} stroke={shape.stroke?shape.color:'none'} strokeWidth={shape.stroke}/>) }
    {design.blocks.map(block=><g key={block.key} style={{animationDelay:`${block.delay}s`}}>
      {block.lines.map((line,i)=><text key={i} x={block.align==='center'?block.x+block.w/2:block.x} y={block.y+i*block.lineHeight+block.fontSize*.82} fill={block.color} fontSize={block.fontSize} fontFamily={block.font==='montserratBlack'?'Typography Montserrat':block.font==='montserrat'?'Montserrat':block.font==='mono'?'Courier New, monospace':block.font==='serif'?'Georgia, serif':'Arial, sans-serif'} fontWeight={block.font==='montserratBlack'?900:block.font==='montserrat'?(block.bold?800:500):(block.bold?700:400)} textAnchor={block.align==='center'?'middle':'start'}>{line}</text>)}
    </g>)}
  </svg>;
}
