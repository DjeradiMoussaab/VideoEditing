import test from 'node:test';
import assert from 'node:assert/strict';
import {ELEMENT_CATEGORIES,applyElementPreset} from '../../../../../SHARED/element-presets.mjs';
import {createGraphic,validateGraphics,graphicsSvg} from '../../../../../SHARED/graphics.mjs';
test('each simple category offers two valid renderable designs',()=>{
  const source={...createGraphic('title',3,15,'element'),end:14,text:'My title'};
  for(const category of ELEMENT_CATEGORIES){assert.equal(category.presets.length,2);for(const preset of category.presets){
    const result=validateGraphics([applyElementPreset(source,preset,15)],15)[0];
    assert.equal(result.id,'element');assert.equal(result.start,3);assert.equal(result.end,14);
    assert.equal(result.type,preset.type);assert.match(graphicsSvg([result],6),/<svg/);
    if(['title','big-title','lower-third'].includes(result.type))assert.equal(result.text,'My title');
  }}
});
test('choosing a simple design removes old animation and grouping',()=>{
  const source={...createGraphic('circle',0,15,'circle'),groupId:'group',locked:true,keyframes:[{at:0,x:.2,y:.2}]};
  const result=applyElementPreset(source,ELEMENT_CATEGORIES[0].presets[0],15);
  assert.deepEqual(result.keyframes,[]);assert.equal(result.groupId,null);assert.equal(result.locked,false);
});
