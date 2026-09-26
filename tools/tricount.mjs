// Triangle budget per character part (node tools/tricount.mjs)
import { Builder } from '../src/render3d/chars/geom.js';
import { buildBody } from '../src/render3d/chars/build.js';
import { BONES } from '../src/render3d/chars/bones.js';
const looks = {
  luffy: { race: 'human', seed: 1, hair: 'spiky', hat: 'straw', top: '#c62828', topStyle: 'vest', bottomStyle: 'shorts', waist: 'sash', shoeStyle: 'sandals', muscle: 0.7 },
  sanji: { race: 'human', seed: 22, hair: 'short', top: '#212121', topStyle: 'jacket', top2: '#5c8fd6', tie: '#212121', bottomStyle: 'slim', shoeStyle: 'shoes' },
  dress: { race: 'human', seed: 50, fem: true, hair: 'ponytail', topStyle: 'dress', bottomStyle: 'longskirt', shoeStyle: 'shoes' },
};
const orig = Builder.prototype.add;
for (const [name, look] of Object.entries(looks)) {
  for (const lod of [0, 1]) {
    const per = {};
    Builder.prototype.add = function (g, m, col, bone, part) {
      const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      const k = BONES[bone] || bone;
      per[k] = (per[k] || 0) + n;
      return orig.call(this, g, m, col, bone, part);
    };
    const { geo } = buildBody(look, null, lod);
    const total = geo.index.count / 3;
    console.log(name, 'lod', lod, 'total', total, JSON.stringify(per));
  }
}
Builder.prototype.add = orig;
