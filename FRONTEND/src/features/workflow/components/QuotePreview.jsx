import { quoteComposition } from '../../../../../SHARED/quote-styles.mjs';

export function QuotePreview({ styleId, values, animated = false, label = 'Quote preview' }) {
  const design=quoteComposition(styleId,values);
  return <svg className={`quote-design-preview ${animated?'is-animated':''}`} viewBox="0 0 1920 1080" role="img" aria-label={label}>
    <rect width="1920" height="1080" fill={design.bg}/>
    {design.shapes.map((shape,i)=><rect key={i} x={shape.x} y={shape.y} width={shape.w} height={shape.h} fill={shape.stroke?'none':shape.color} stroke={shape.stroke?shape.color:'none'} strokeWidth={shape.stroke}/>) }
    {design.blocks.map(block=><g key={block.key} style={{animationDelay:`${block.delay}s`}}>
      {block.lines.map((line,i)=><text key={i} x={block.align==='center'?block.x+block.w/2:block.x} y={block.y+i*block.lineHeight+block.fontSize*.82} fill={block.color} fontSize={block.fontSize} fontFamily={block.serif?'Georgia, serif':'Arial, sans-serif'} fontWeight={block.bold?700:400} textAnchor={block.align==='center'?'middle':'start'}>{line}</text>)}
    </g>)}
  </svg>;
}
