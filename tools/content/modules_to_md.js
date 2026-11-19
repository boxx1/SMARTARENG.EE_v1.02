/* Write content/02-modules.md from the module data in design/Main.dc.html (one-off export of the current texts). */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const s = fs.readFileSync(path.join(ROOT, 'design/Main.dc.html'), 'utf8');
const code = s.match(/data-dc-script data-props='[^']*'>([\s\S]*?)<\/script>/)[1];
global.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) };
global.document = { querySelector: () => null, querySelectorAll: () => [] };
const { MODS, RATE } = new Function('DCLogic', code + ';return {MODS, RATE};')(class {});
const word = h => (h % 10 === 1 && h % 100 !== 11) ? 'ак. час' : ([2, 3, 4].includes(h % 10) && ![12, 13, 14].includes(h % 100)) ? 'ак. часа' : 'ак. часов';
let md = `# Модули обучения

Источник для карточек конструктора, окна «Посмотреть программу» и PDF.
Цена модуля считается сама: часы × ${RATE} € на участника — в тексте цену не пишем.

Поля и лимиты (по вёрстке карточки на 1440 px):
- **title** — задача клиента, не название инструмента. До 52 знаков (2 строки в карточке).
- **tool** — инструмент или тема, мелкая подпись. До 26 знаков.
- **hours** — академические часы: 4, 8, 20 или 32.
- **goal** — зачем модуль, одно предложение. До 140 знаков.
- **topics** — ровно 3 темы, каждая до 70 знаков.
- **result** — что участник умеет после модуля. До 140 знаков.

Статусы: \`черновик\` → \`на правке\` → \`утверждено\`. На сайт переносим только «утверждено».

`;
MODS.forEach((m, i) => {
  md += `---

## ${String(i + 1).padStart(2, '0')} · ${m.id}

- **status:** черновик
- **hours:** ${m.h} (${m.h} ${word(m.h)})
- **tool:** ${m.tool}
- **title:** ${m.title}
- **goal:** ${m.goal}
- **topics:**
${m.topics.map(t => '  - ' + t).join('\n')}
- **result:** ${m.result}

`;
});
const out = path.join(ROOT, 'content/02-modules.md');
if (fs.existsSync(out) && !process.argv.includes('--force')) { console.log('content/02-modules.md уже есть — не перезаписываю (правки редактора важнее). Добавьте --force, если нужно.'); process.exit(0); }
fs.writeFileSync(out, md);
console.log('content/02-modules.md:', MODS.length, 'modules');
