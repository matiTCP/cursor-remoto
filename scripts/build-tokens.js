// Convierte tokens.json (el mismo del design system "Mouse Final") en public/tokens.css.
// Uso: npm run tokens   — después de cambiar cualquier valor en tokens.json.
// Para un tema: node scripts/build-tokens.js themes/<nombre>/tokens.json themes/<nombre>/tokens.css
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const inPath = path.resolve(root, process.argv[2] || 'tokens.json');
const outPath = path.resolve(root, process.argv[3] || path.join('public', 'tokens.css'));
const tokens = JSON.parse(fs.readFileSync(inPath, 'utf8'));

// Un alias "{otro-token}" se vuelve var(--otro-token).
const css = (v) => String(v).replace(/^\{(.+)\}$/, 'var(--$1)');
const firstTheme = tokens.color.themes[0].id;
const colorValue = (v) => (typeof v === 'string' ? v : v[firstTheme]);

const lines = [];
const section = (title, list, getValue = (t) => t.value) => {
  lines.push('', `  /* ${title} */`);
  for (const t of list) lines.push(`  --${t.name}: ${css(getValue(t))};`);
};

section('Color', tokens.color.tokens, (t) => colorValue(t.value));
lines.push('', '  /* Tipografía */');
for (const [key, stack] of Object.entries(tokens.type.families)) lines.push(`  --font-${key}: ${stack};`);
for (const key of Object.keys(tokens)) {
  if (['name', 'version', 'meta', 'color', 'type'].includes(key)) continue;
  if (tokens[key] && Array.isArray(tokens[key].tokens)) section(key, tokens[key].tokens);
}

const out = `/* ${tokens.name} — generado desde tokens.json con "npm run tokens". No editar a mano. */

:root {
  color-scheme: dark;${lines.join('\n')}
}
`;

fs.writeFileSync(outPath, out);
console.log(`${path.relative(root, outPath)} listo`);
