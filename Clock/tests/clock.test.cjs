const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = vm.createContext({TC_TEST_MODE:true, $:{global:{}}});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../Ticking Clock.jsx'), 'utf8'), context);
const api = context.$.global.TC_API;
const defaults = Object.fromEntries(api.schema.map(s => ['TC | '+s[0]+' / '+s[1],s[3]]));
let tests = 0;
function evaluate(expression, changes={}, time=0, index=1) {
    const values = {...defaults,...Object.fromEntries(Object.entries(changes).map(([k,v])=>['TC | '+k,v]))};
    context.time=time; context.inPoint=0; context.thisComp={frameDuration:1/30}; context.textIndex=index;
    context.text={sourceText:{style:{fontSize:100}}};
    context.effect=name=>()=>({value:typeof values[name]==='function'?values[name](time):values[name],
        valueAtTime:t=>typeof values[name]==='function'?values[name](t):values[name]});
    return vm.runInContext(expression, context);
}
function clock(changes,time) { return evaluate('('+api.clockCore.toString()+')()', changes,time); }
function check(name,fn) { fn(); tests++; console.log('PASS '+name); }
check('default time and midnight wrap',()=>{
    assert.equal(clock({},0).current,'10:08:45');
    assert.equal(clock({'Time / Start time (sec)':86399},1).current,'00:00:00');
});
check('no seconds and noon/midnight suffixes',()=>{
    for(const [sec,result] of [[0,'12:00 AM'],[43199,'11:59 AM'],[43200,'12:00 PM'],[86399,'11:59 PM']])
        assert.equal(clock({'Time / Start time (sec)':sec,'Display / AM / PM':1,'Display / Show seconds':0},0).current,result);
});
check('12-hour without suffix and hour-only zero suppression',()=>{
    assert.equal(clock({'Time / Start time (sec)':3661,'Display / 24-hour':0,'Display / Leading hour zero':0},0).current,'\u20071:01:01');
});
check('countdown crossing midnight',()=>{
    const k=clock({'Time / Start time (sec)':0,'Time / Speed':-1},1.1);
    assert.equal(k.current,'23:59:59'); assert.equal(k.previous,'00:00:00');
});
check('zero speed and first frame have no roll',()=>{
    assert.equal(clock({},0).active,false); assert.equal(clock({'Time / Speed':0},4).active,false);
});
check('duration zero gives an instant digit change',()=>{
    const c={'Motion / Duration (sec)':0};
    assert.equal(evaluate(api.expressions.opacity,c,1.05,8),0);
    assert.equal(evaluate(api.expressions.source,c,1.05),'10:08:46');
});
check('unchanged digits stay visible and stationary',()=>{
    assert.equal(evaluate(api.expressions.opacity,{},1.1,1),0);
    assert.equal(evaluate(api.expressions.position,{},1.1,1),0);
});
check('digit fades out, changes invisibly, and fades in; direction reverses',()=>{
    const a=evaluate(api.expressions.opacity,{},1.1,8);
    assert.ok(a>0&&a<100);
    assert.equal(evaluate(api.expressions.source,{},1.1),'10:08:45');
    assert.equal(evaluate(api.expressions.source,{},1.24),'10:08:46');
    const down=evaluate(api.expressions.position,{},1.1,8);
    assert.ok(down>0); assert.equal(evaluate(api.expressions.position,{'Motion / Move up':1},1.1,8),-down);
    assert.ok(evaluate(api.expressions.position,{},1.24,8)<0);
});
check('pulse opacity extrema and colon visibility',()=>{
    assert.equal(evaluate(api.expressions.opacity,{},0,3),0);
    assert.equal(evaluate(api.expressions.opacity,{},0.5,3),65);
    assert.equal(evaluate(api.expressions.opacity,{'Colons / Show colons':0},0,3),100);
    assert.equal(evaluate(api.expressions.opacity,{'Colons / Pulse':0},0.5,3),0);
});
check('manual absolute time supports reverse motion',()=>{
    const k=clock({'Time / Manual':1,'Time / Manual time (sec)':t=>43201-t},1.1);
    assert.equal(k.current,'12:00:00'); assert.equal(k.previous,'12:00:01'); assert.equal(k.active,true);
});
check('fast cascade settles before the next tick',()=>{
    const c={'Time / Start time (sec)':86399,'Time / Speed':10};
    assert.equal(evaluate(api.expressions.opacity,c,0.1999,1),0);
});
check('display layouts retain fixed character counts across transitions',()=>{
    for(let sec=0;sec<86400;sec+=137) for(const seconds of [0,1]) for(const suffix of [0,1]){
        const k=clock({'Time / Start time (sec)':sec,'Display / Show seconds':seconds,'Display / AM / PM':suffix},0);
        assert.equal(k.current.length,k.previous.length);
    }
});
console.log(tests+' checks passed. These verify expression math, not AE rendering.');
