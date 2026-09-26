// DOM wrappers around the procedural icon canvases. The canvases are cached
// and shared, so the DOM gets <img> copies (a canvas can only live in one
// place in the document).
import { h } from './dom.js';
import { itemIcon, skillIcon, uiIcon, iconURL } from '../render/icons.js';

const img = (canvas, px, cls = '') => h('img.icon' + cls, { src: iconURL(canvas), width: px, height: px, draggable: false, alt: '' });

export const itemImg = (idOrDef, px = 32, cls) => img(itemIcon(idOrDef, 64), px, cls);
export const skillImg = (def, px = 32, cls) => img(skillIcon(def, 64), px, cls);
export const uiImg = (name, px = 24, cls) => img(uiIcon(name, 48), px, cls);
