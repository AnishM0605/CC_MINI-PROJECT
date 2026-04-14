const fs = require('fs');
const path = require('path');

const root = path.join(process.cwd(), 'replica-core');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : path.join(dir, d.name)
  );
}

const re = /const\s+(\w+)\s*=/g;
for (const file of walk(root).filter(p => p.endsWith('.js'))) {
  const txt = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = re.exec(txt))) {
    const name = m[1];
    const rest = txt.slice(m.index + m[0].length);
    if (new RegExp('\\b' + name + '\\s*=').test(rest)) {
      console.log(file, name);
      break;
    }
  }
}
