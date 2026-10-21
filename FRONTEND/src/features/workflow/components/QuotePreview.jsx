import {profileMarkup} from '../../../../../SHARED/profile.mjs';
import profileTitleFont from '../../../../../BACKEND/assets/profile/Multicolore Pro.otf?url';
import profileBodyFont from '../../../../../BACKEND/assets/modern-clean/Montserrat-Medium.ttf?url';
import {presentationMarkup} from '../../../../../SHARED/presentation.mjs';
import presentationBlack from '../../../../../BACKEND/assets/corporate-trend/Raleway-Black.ttf?url';
import presentationBold from '../../../../../BACKEND/assets/corporate-trend/Raleway-Bold.ttf?url';
import {useId} from 'react';
import {textQuoteMarkup} from '../../../../../SHARED/text-quotes.mjs';
import quoteFont from '../../../../../BACKEND/assets/text-quotes/BlackHanSans-Regular.ttf?url';
import { quoteComposition } from '../../../../../SHARED/quote-styles.mjs';

export function QuotePreview({ styleId, values, animated = false, label = 'Quote preview' }) {
  const clipId=useId().replace(/:/g,'');
  const design=quoteComposition(styleId,values);
  if(design.profile)return <svg className="quote-design-preview" viewBox="0 0 1920 1080" role="img" aria-label={label}>
    <style>{`@font-face{font-family:"Multicolore Pro";src:url("${profileTitleFont}")}@font-face{font-family:"Montserrat";src:url("${profileBodyFont}");font-weight:500}`}</style>
    <g dangerouslySetInnerHTML={{__html:profileMarkup(design,3,8,clipId,true)}}/>
  </svg>;
  if(design.presentation)return <svg className="quote-design-preview" viewBox="0 0 1920 1080" role="img" aria-label={label}>
    <style>{`@font-face{font-family:"Presentation Black";src:url("${presentationBlack}")}@font-face{font-family:"Presentation Bold";src:url("${presentationBold}")}`}</style>
    <g dangerouslySetInnerHTML={{__html:presentationMarkup(design,3,8,clipId,true)}}/>
  </svg>;
  if(design.chevronQuote)return <svg className="quote-design-preview" viewBox="0 0 1920 1080" role="img" aria-label={label}>
    <style>{`@font-face{font-family:"Black Han Sans";src:url("${quoteFont}");font-weight:400}`}</style>
    <rect width="1920" height="1080" fill={design.bg}/>
    <g dangerouslySetInnerHTML={{__html:textQuoteMarkup(design,3,8,clipId)}}/>
  </svg>;
  return <svg className={`quote-design-preview ${animated?'is-animated':''}`} viewBox="0 0 1920 1080" role="img" aria-label={label}>
    <rect width="1920" height="1080" fill={design.bg}/>
    {design.lifestyle&&<><rect x="0" y="140" width="1920" height="800" fill="#30354b"/><path d="M0 940L780 140H1120L320 940Z" fill={values?.atmosphereColor||'#5476d7'} opacity=".15"/></>}
    {design.id==='typography_focus' &&<image href="/typography-background-1.jpg" width="1920" height="1080" preserveAspectRatio="xMidYMid slice" style={{filter:'blur(12px) brightness(.65) grayscale(1)'}}/>}
    {design.id==='typography_split'&&<svg x="1088" width="832" height="1080" viewBox="0 0 832 1080" overflow="hidden"><image href="/typography-background-2.jpg" width="832" height="1080" preserveAspectRatio="xMidYMid slice" style={{filter:'grayscale(1) brightness(.9)'}}/></svg>}
    {design.id==='modern_clean'&&<image style={{filter:"blur(24px) brightness(0.65) saturate(0.65)"}} href="/modern-clean-background.jpg" width="1920" height="1080" preserveAspectRatio="xMidYMid slice"/>}
    {design.shapes.map((shape,i)=><rect key={i} x={shape.x} y={shape.y} width={shape.w} height={shape.h} fill={shape.stroke?'none':shape.color} stroke={shape.stroke?shape.color:'none'} strokeWidth={shape.stroke}/>) }
    {design.blocks.map(block=><g key={block.key} style={{animationDelay:`${block.delay}s`}}>
      {block.lines.map((line,i)=><text key={i} x={block.align==='center'?block.x+block.w/2:block.align==='right'?block.x+block.w:block.x} y={(block.baseline??block.y+block.fontSize*.82)+i*block.lineHeight} fill={block.color} fontSize={block.fontSize} fontFamily={block.font==='montserratLight'?'Lifestyle Montserrat':block.font==='montserratBlack'?'Typography Montserrat':block.font==='montserrat'?'Montserrat':block.font==='mono'?'Courier New, monospace':block.font==='serif'?'Georgia, serif':'Arial, sans-serif'} fontWeight={block.font==='montserratLight'?300:block.font==='montserratBlack'?900:block.font==='montserrat'?(block.bold?800:500):(block.bold?700:400)} textAnchor={block.align==='center'?'middle':block.align==='right'?'end':'start'}>{line}</text>)}
    </g>)}
  </svg>;
}
