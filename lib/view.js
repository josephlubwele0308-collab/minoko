const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const entry = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pages = new Map();

function pageSource(name) {
  if (!pages.has(name)) {
    pages.set(name, fs.readFileSync(path.join(root, 'pages', `${name}.html`), 'utf8'));
  }
  return pages.get(name);
}

function fill(html, slots) {
  return html.replace(/\{\{([a-z0-9_]+)\}\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(slots, key) ? String(slots[key] ?? '') : ''
  ));
}

function render(name, slots) {
  const main = fill(pageSource(name), slots);
  return fill(entry, { scripts: '<script src="/app.js" defer></script>', ...slots, main });
}

module.exports = { render };
