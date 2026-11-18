function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

const SOURCE_ICON = {
  'Hugging Face': 'mask',
  arXiv: 'paper',
  GitHub: 'code',
  Wikipédia: 'book',
};

const THEME_ICON = {
  'Traduction automatique': 'translate',
  'Reconnaissance vocale': 'mic',
  'Synthèse vocale': 'speak',
  'Modèles de langue': 'layers',
  'Jeux de données': 'database',
  'Ressources ouvertes': 'book',
};

function sourceIcon(source) {
  return icon(SOURCE_ICON[source] || 'sheets');
}

function themeIcon(theme) {
  return icon(THEME_ICON[theme] || 'layers');
}

module.exports = { icon, sourceIcon, themeIcon };
