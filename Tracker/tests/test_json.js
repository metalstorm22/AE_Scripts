const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const context = vm.createContext({JSON:undefined});
vm.runInContext(fs.readFileSync('ae/lib.jsx','utf8'), context);
const parse=context.SceneTrack.parse;
assert.equal(parse('{"file":"a\\n\\u263a","p":[1,-2.3e2,true,null]}').file,'a\n☺');
for (const value of ['{"x":function(){}}','{"x":1,}','[1,]','NaN','1 garbage','{"x":"bad\n"}'])assert.throws(()=>parse(value));
vm.runInContext('var roundtrip={path:"x\\\\y",p:[1,2,3]};if(SceneTrack.parse(SceneTrack.stringify(roundtrip)).p[2]!==3)throw Error("roundtrip");',context);
for(const name of ['ae/SceneTrack.jsx','tests/ae_geometry_probe.jsx'])new vm.Script(fs.readFileSync(name,'utf8').replace(/^#.*$/gm,''));
console.log('ExtendScript syntax and fallback JSON parser checks passed');

const externalJSON=vm.createContext({JSON:{parse(){throw Error('External JSON parser must not run');}}});
vm.runInContext(fs.readFileSync('ae/lib.jsx','utf8'),externalJSON);
assert.equal(externalJSON.SceneTrack.parse('{\"ok\":true}').ok,true);
console.log('Global JSON polyfill isolation passed');
