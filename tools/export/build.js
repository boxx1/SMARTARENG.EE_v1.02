/* Build the stand-alone mockup: design/*.dc.html  ->  docs/index.html (+ docs/assets)
   Run: node tools/export/build.js   (from the repository root)                         */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const D = p => path.join(ROOT, 'design', p);
const OUT = path.join(ROOT, 'docs');
const dc = require('./dcmini.js');

function readDc(name) {
  const src = fs.readFileSync(D(name + '.dc.html'), 'utf8');
  const helmet = (src.match(/<helmet>([\s\S]*?)<\/helmet>/) || [, ''])[1];
  const body = src.match(/<\/helmet>([\s\S]*?)<\/x-dc>/)[1];
  const sm = src.match(/<script type="text\/x-dc" data-dc-script data-props='([^']*)'>([\s\S]*?)<\/script>/);
  const props = JSON.parse(sm[1]);
  const defaults = {};
  Object.keys(props).forEach(k => { if (k[0] !== '$' && 'default' in props[k]) defaults[k] = props[k].default; });
  return { name, helmet, body, code: sm[2], defaults };
}
const parts = ['Main', 'Strip', 'LogoMark'].map(readDc);
const main = parts[0];

/* --- adapt the design files to a normal web page --- */
main.body = main.body.replace('<canvas data-gl="hero"', '<canvas data-keep="hero-canvas" data-gl="hero"');
main.code = main.code
  .replace("'/_blob/a06055ad7c1fd1713b99e336e982efce'", "'assets/fira-sans-regular.ttf'")
  .replace("'/_blob/5b4a5bcf6fbb2f5ff942718ea7da14bc'", "'assets/fira-sans-medium.ttf'")
  .replace("'/_blob/85b31785b80d89cff3ea41ebd4433ab0'", "'assets/jura-light.ttf'")
  /* the page re-renders as a whole, so look the background layers up on every update */
  .replace('zEls.forEach(function (el) {', 'document.querySelectorAll(\'[data-zones]\').forEach(function (el) {');
if (!/assets\/jura-light/.test(main.code)) throw new Error('font urls not patched');
if (!/querySelectorAll\('\[data-zones\]'\)\.forEach/.test(main.code)) throw new Error('zones not patched');

/* --- server-side render (so readers without JavaScript, e.g. ChatGPT, see the whole page) --- */
global.window = global.window || { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) };
global.document = global.document || { querySelector: () => null, querySelectorAll: () => [] };
const defs = {};
parts.forEach(p => {
  const Component = new Function('DCLogic', p.code + '\n;return Component;')(dc.DCLogic);
  defs[p.name] = { Component, defaults: p.defaults, tree: dc.parse(p.body) };
});
const app = new dc.App(defs);
app.rootName = 'Main';
const ssr = app.html().replace(/ data-ev-[a-z]+="\d+"/g, '');

/* --- page --- */
const styles = parts.map(p => p.helmet.replace(/<link[^>]*>/g, '')).join('\n');
const clientDefs = parts.map(p =>
  `defs[${JSON.stringify(p.name)}] = { Component: (function (DCLogic) {\n${p.code}\n;return Component; })(dcmini.DCLogic), defaults: ${JSON.stringify(p.defaults)}, tree: dcmini.parse(${JSON.stringify(p.body)}) };`
).join('\n');
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Smart Areng — макет сайта (вариант «Хром»)</title>
<meta name="description" content="Рабочий макет сайта smartareng.ee: обучение ИИ для команд малого и среднего бизнеса, конструктор программы и ценовое предложение в PDF.">
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Jura:wght@300;400;500&family=Fira+Sans:wght@300;400;500&display=swap" rel="stylesheet">
${styles}
</head>
<body>
<!-- Макет собран из design/*.dc.html (${stamp} UTC). Тексты — content/*.md. Карта блоков — MAKET.md. -->
<div id="app">${ssr}</div>
<script src="assets/jspdf.umd.min.js"></script>
<script src="assets/dcmini.js"></script>
<script>
(function () {
var defs = {};
${clientDefs}
var app = new dcmini.App(defs);
app.mount(document.getElementById('app'), 'Main', {});
})();
</script>
</body>
</html>
`;
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.copyFileSync(path.join(__dirname, 'dcmini.js'), path.join(OUT, 'assets/dcmini.js'));
const copies = {
  'jspdf.umd.min.js': '/home/claude/pdfkit/node_modules/jspdf/dist/jspdf.umd.min.js',
  'fira-sans-regular.ttf': '/home/claude/pdfkit/fs-regular.ttf',
  'fira-sans-medium.ttf': '/home/claude/pdfkit/fs-medium.ttf',
  'jura-light.ttf': '/home/claude/pdfkit/jura-light.ttf'
};
Object.keys(copies).forEach(k => { const dst = path.join(OUT, 'assets', k); if (fs.existsSync(copies[k])) fs.copyFileSync(copies[k], dst); else if (!fs.existsSync(dst)) throw new Error('missing ' + k); });
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log('docs/index.html', (html.length / 1024).toFixed(0) + ' KB, SSR', (ssr.length / 1024).toFixed(0) + ' KB');
