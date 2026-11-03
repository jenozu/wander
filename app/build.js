// Builds public/: inlines Leaflet + pixel fonts into index.src.html, copies static files, draws the pixel app icons.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const out = 'public';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const nm = 'node_modules';
const css = fs.readFileSync(path.join(nm, 'leaflet', 'dist', 'leaflet.css'), 'utf8');
const js = fs.readFileSync(path.join(nm, 'leaflet', 'dist', 'leaflet.js'), 'utf8').replace(/\/\/# sourceMappingURL=.*/g, '');
const face = (family, file) => `@font-face{font-family:"${family}";font-weight:400;font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${fs.readFileSync(file).toString('base64')}) format("woff2")}`;
const fonts = [
  face('Press Start 2P', path.join(nm, '@fontsource', 'press-start-2p', 'files', 'press-start-2p-latin-400-normal.woff2')),
  face('Pixelify Sans', path.join(nm, '@fontsource', 'pixelify-sans', 'files', 'pixelify-sans-latin-400-normal.woff2'))
].join('\n');
const html = fs.readFileSync('index.src.html', 'utf8')
  .split('/*LEAFLET_CSS*/').join(css)
  .split('/*FONTS*/').join(fonts)
  .split('/*LEAFLET_JS*/').join(js);
fs.writeFileSync(path.join(out, 'index.html'), html);
for (const f of fs.readdirSync('static')) fs.copyFileSync(path.join('static', f), path.join(out, f));

// --- pixel icon: baby-blue field, black frame, pink map pin ---
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const BITMAP = [
  'kkkkkkkkkkkkkkkk',
  'k..............k',
  'k..............k',
  'k....kkkkkk....k',
  'k...kppppppk...k',
  'k..kppwwppppk..k',
  'k..kpwppkkppk..k',
  'k..kppppkkppk..k',
  'k..kppppppppk..k',
  'k...kppppppk...k',
  'k....kppppk....k',
  'k.....kppk.....k',
  'k......kk......k',
  'k..............k',
  'k..............k',
  'kkkkkkkkkkkkkkkk'
];
const PAL = { '.': [169, 212, 255], k: [27, 22, 48], p: [255, 194, 217], w: [255, 255, 255] };
function icon(s) {
  const raw = Buffer.alloc((s * 3 + 1) * s);
  for (let y = 0; y < s; y++) {
    raw[y * (s * 3 + 1)] = 0;
    for (let x = 0; x < s; x++) {
      const c = PAL[BITMAP[Math.floor(y * 16 / s)][Math.floor(x * 16 / s)]], o = y * (s * 3 + 1) + 1 + x * 3;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(s, 0); ihdr.writeUInt32BE(s, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
for (const n of [180, 192, 512]) fs.writeFileSync(path.join(out, `icon-${n}.png`), icon(n));
console.log('built', fs.readdirSync(out).join(', '));
