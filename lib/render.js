const { icon, sourceIcon, themeIcon } = require('./icons');
const view = require('./view');

const SOURCES = ['Hugging Face', 'arXiv', 'GitHub', 'Wikipédia'];
const THEMES = [
  'Traduction automatique',
  'Reconnaissance vocale',
  'Synthèse vocale',
  'Modèles de langue',
  'Jeux de données',
  'Ressources ouvertes',
];
const LANGUAGES = ['Lingala', 'Swahili', 'Tshiluba', 'Kikongo', 'Plusieurs'];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function safeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
  } catch {
    return '#';
  }
  return '#';
}

function formatDate(value) {
  if (!value) return 'Date non précisée';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date non précisée';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('fr-FR');
}

function queryString(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

function jsonSlot(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

const STATE_ICON = { loading: 'layers', error: 'alert', empty: 'search', ok: 'check' };

function stateBox(kind, title, text, id) {
  const safeKind = STATE_ICON[kind] ? kind : 'error';
  const role = safeKind === 'error' ? 'alert' : 'status';
  const busy = safeKind === 'loading' ? ' aria-busy="true"' : '';
  const idAttr = id ? ` id="${esc(id)}"` : '';
  return `<div class="state state-${safeKind}" role="${role}"${busy}${idAttr}>
    ${icon(STATE_ICON[safeKind])}
    <div>
      <strong>${esc(title)}</strong>
      <p>${esc(text)}</p>
    </div>
  </div>`;
}

function skeletonCard() {
  return `<article class="slip skeleton" aria-hidden="true">
    <div class="slip-lang"><div class="bone bone-tag"></div></div>
    <h3><div class="bone bone-title"></div></h3>
    <div class="bone"></div>
    <div class="bone"></div>
    <div class="bone bone-short"></div>
    <div class="meta"><div class="bone bone-meta"></div></div>
  </article>`;
}

function skeletonGrid(count) {
  const cards = Array.from({ length: count }, skeletonCard).join('');
  return `<div class="grid skeleton-grid" role="status" aria-busy="true" aria-label="Chargement des contenus">${cards}</div>`;
}

function noticeBox(flash) {
  if (!flash) return '';
  if (typeof flash === 'string') return stateBox('ok', 'Confirmation', flash);
  return stateBox(flash.kind || 'ok', flash.title || 'Confirmation', flash.text || '');
}

function shell(data, title, current) {
  const slots = { title: esc(title) };
  ['accueil', 'veille', 'dashboard', 'apropos', 'favoris', 'connexion'].forEach((key) => {
    slots[`current_${key}`] = key === current ? ' aria-current="page"' : '';
  });
  const banners = [];
  if (data.running) {
    banners.push(stateBox('loading', 'Collecte en cours', 'Les sources sont interrogées. Les listes se complètent à la fin du passage.'));
  }
  banners.push(noticeBox(data.flash));
  slots.flash = banners.join('');
  slots.account = data.user
    ? `<a href="/favoris"${current === 'favoris' ? ' aria-current="page"' : ''}>${icon('bookmark')}<span>Favoris</span></a>
       <form method="post" action="/deconnexion">
         <input type="hidden" name="_csrf" value="${esc(data.csrf)}">
         <button class="linkish" type="submit">${icon('out')}<span>Sortir</span></button>
       </form>`
    : `<a href="/connexion"${current === 'connexion' ? ' aria-current="page"' : ''}>${icon('key')}<span>Connexion</span></a>`;
  return slots;
}

function page(name, data, title, current, slots = {}) {
  return view.render(name, { ...shell(data, title, current), ...slots });
}

function langClass(language) {
  return {
    Lingala: 'lang-ln',
    Swahili: 'lang-sw',
    Tshiluba: 'lang-ts',
    Kikongo: 'lang-kk',
  }[language] || 'lang-multi';
}

function slipMeta(item) {
  return `<p class="slip-meta">
    <span class="source-tag">${sourceIcon(item.source)}<span>${esc(item.source)}</span></span>
    <span class="theme-tag">${themeIcon(item.theme)}<span>${esc(item.theme)}</span></span>
  </p>`;
}

function card(item) {
  return `<a class="slip ${langClass(item.language)}" href="/contenu/${item.id}">
    <p class="slip-lang"><span>${esc(item.language)}</span></p>
    <h3>${esc(item.title)}</h3>
    <p class="clamp">${esc(item.summary)}</p>
    ${slipMeta(item)}
    <p class="meta">${formatDate(item.published_at)}</p>
  </a>`;
}

function home(data) {
  const featured = data.featured ? `<article class="featured ${langClass(data.featured.language)}">
      <p class="slip-lang"><span>${esc(data.featured.language)}</span></p>
      <h2><a href="/contenu/${data.featured.id}">${esc(data.featured.title)}</a></h2>
      <p>${esc(data.featured.summary)}</p>
      ${slipMeta(data.featured)}
      <p class="meta">${formatDate(data.featured.published_at)}</p>
    </article>` : (data.running
      ? `<article class="featured skeleton" aria-hidden="true"><div class="bone bone-tag"></div><h2><div class="bone bone-title"></div></h2><div class="bone"></div><div class="bone bone-short"></div></article>`
      : stateBox('empty', 'Aucun contenu', 'Aucune source n’a encore répondu. Le tableau de bord indique ce qui a bloqué.'));
  const latest = data.latest.length
    ? data.latest.map(card).join('')
    : (data.running ? skeletonCard() + skeletonCard() + skeletonCard() : '');
  const wiki = (data.wiki || []).map(card).join('')
    || (data.running
      ? skeletonGrid(3)
      : stateBox('empty', 'Pas d’activité Wikipédia', 'Les éditions lingala, swahili et kikongo n’ont pas encore renvoyé de page.'));
  return page('accueil', data, 'Accueil', 'accueil', {
    total: formatNumber(data.counts.total),
    pending: data.running && data.featured ? skeletonGrid(3) : '',
    featured,
    latest,
    wiki,
  });
}

function veilleEmpty(data) {
  const filtered = ['q', 'source', 'theme', 'langue', 'du', 'au'].some((key) => data.filters[key]);
  if (data.running && !filtered) return skeletonGrid(6);
  if (!filtered) {
    return stateBox('empty', 'Base encore vide', 'Aucun contenu n’est enregistré. Le tableau de bord indique si une source a bloqué.');
  }
  return stateBox('empty', 'Aucun résultat', 'Aucun contenu ne correspond à ces critères. Élargissez la recherche ou changez les dates.');
}

function veille(data) {
  const cards = data.items.length
    ? `${data.running ? skeletonGrid(3) : ''}<div class="grid">${data.items.map(card).join('')}</div>`
    : veilleEmpty(data);
  const prev = data.page > 1
    ? `<a class="button button-ghost pager-prev" href="/veille${queryString({ ...data.filters, page: data.page - 1 })}">${icon('arrow')}<span>Page précédente</span></a>`
    : '';
  const next = data.page < data.pages
    ? `<a class="button button-ghost" href="/veille${queryString({ ...data.filters, page: data.page + 1 })}"><span>Page suivante</span>${icon('arrow')}</a>`
    : '';
  return page('veille', data, 'Veille', 'veille', {
    count: formatNumber(data.total),
    state: jsonSlot({
      q: data.filters.q || '',
      source: data.filters.source || '',
      theme: data.filters.theme || '',
      langue: data.filters.langue || '',
      du: data.filters.du || '',
      au: data.filters.au || '',
    }),
    cards,
    pager: `${prev}<p>Page ${data.page} sur ${data.pages}</p>${next}`,
  });
}

function languagePhrase(language) {
  return {
    Lingala: 'le lingala',
    Swahili: 'le swahili',
    Tshiluba: 'le tshiluba',
    Kikongo: 'le kikongo',
    Plusieurs: 'plusieurs langues du corpus',
  }[language] || 'une langue du corpus';
}

function readableSummary(text) {
  return String(text || '')
    .replace(/\\texttt\{([^}]*)\}/g, '$1')
    .replace(/\{\{[\s\S]*?\}\}/g, '')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function summaryParagraphs(text) {
  const clean = readableSummary(text);
  if (!clean) return '<p>La source ne fournit pas de résumé.</p>';
  if (clean.length < 320) return `<p>${esc(clean)}</p>`;
  const parts = clean.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let buffer = '';
  parts.forEach((part) => {
    if (buffer && (buffer.length + part.length) > 420) {
      chunks.push(buffer);
      buffer = part;
    } else {
      buffer = buffer ? `${buffer} ${part}` : part;
    }
  });
  if (buffer) chunks.push(buffer);
  return chunks.map((part) => `<p>${esc(part)}</p>`).join('');
}

function quoted(text) {
  return `<blockquote>${summaryParagraphs(text)}</blockquote>`;
}

function detailBody(item) {
  const summary = readableSummary(item.summary);
  const name = languagePhrase(item.language);
  const when = formatDate(item.published_at);
  if (item.source === 'Hugging Face') return huggingFaceBody(item, summary, name, when);
  if (item.source === 'arXiv') return arxivBody(item, summary, name, when);
  if (item.source === 'GitHub') return githubBody(item, summary, name, when);
  if (item.source === 'Wikipédia') return wikiBody(item, summary, name, when);
  return `<p>${esc(summary)}</p>`;
}

function huggingFaceBody(item, summary, name, when) {
  const downloads = (summary.match(/([\d\u202f\u00a0\s]+)\s+téléchargements/) || [])[1];
  const task = (summary.match(/Tâche : ([^.]+)/) || [])[1];
  const count = downloads ? downloads.replace(/\s+/g, ' ').trim() : '';
  const slug = item.title.split('/').pop().replace(/[-_]+/g, ' ');
  const owner = item.title.includes('/') ? item.title.split('/')[0] : item.title;
  const dated = when === 'Date non précisée' ? '' : ` Le catalogue indique ${when}.`;
  if (item.theme === 'Jeux de données' || /^Jeu de données/.test(summary)) {
    return `<p>${esc(owner)} met à disposition le corpus « ${esc(slug)} » sur Hugging Face.${count ? ` Le compteur affiche ${esc(count)} téléchargements.` : ''}${esc(dated)}</p>
      <p>Le nom du jeu de données porte sur ${esc(name)}. On peut s’en servir pour entraîner ou comparer un outil, à condition d’ouvrir la fiche Hugging Face et de vérifier ce que les fichiers contiennent vraiment.</p>`;
  }
  const taskSentence = task
    ? `Le catalogue classe ce modèle dans la tâche « ${task.trim()} ».`
    : 'Le catalogue ne précise pas la tâche.';
  return `<p>${esc(item.title)} est un modèle publié par ${esc(owner)} sur Hugging Face. ${esc(taskSentence)}${count ? ` Il compte ${esc(count)} téléchargements.` : ''}${esc(dated)}</p>
    <p>Son nom indique ${esc(name)}. Le chiffre de téléchargements dit si d’autres personnes l’ont déjà pris, pas s’il convient à une rédaction ou à une radio congolaise.</p>`;
}

function arxivBody(item, summary, name, when) {
  const dated = when === 'Date non précisée' ? 'la date de dépôt n’est pas indiquée' : `déposée le ${when}`;
  return `<p>« ${esc(item.title)} » est une prépublication ${esc(dated)}. Le texte cite ${esc(name)}, d’où sa place dans cette veille.</p>
    <h2>Résumé d’origine</h2>
    ${quoted(summary)}`;
}

function githubBody(item, summary, name, when) {
  const stars = (summary.match(/([\d\u202f\u00a0\s]+)\s+étoiles/) || [])[1];
  const count = stars ? stars.replace(/\s+/g, ' ').trim() : '0';
  const bare = /sans description/.test(summary);
  const description = summary
    .replace(/\s*[\d\u202f\u00a0\s]+étoiles\.\s*$/, '')
    .replace(/^Dépôt de code lié à « [^»]+ », sans description\.\s*/, '')
    .trim();
  const dated = when === 'Date non précisée' ? '' : ` Dernière activité relevée : ${when}.`;
  if (bare || !description) {
    return `<p>Le dépôt ${esc(item.title)} n’a pas de description.${esc(dated)} GitHub lui compte ${esc(count)} étoile${count === '1' ? '' : 's'}.</p>
      <p>Minoko le garde uniquement parce que le nom contient ${esc(name)}. Sans phrase d’intention, on ne sait pas encore si le code traite vraiment cette langue.</p>`;
  }
  return `<p>${esc(item.title)} est un dépôt public, avec ${esc(count)} étoile${count === '1' ? '' : 's'}.${esc(dated)} Les auteurs le présentent ainsi :</p>
    ${quoted(description)}
    <p>La veille le relie à ${esc(name)} à partir de ce texte.</p>`;
}

function wikiBody(item, summary, name, when) {
  const fresh = /^Nouvelle page/.test(summary);
  const action = fresh ? 'a créé' : 'a modifié';
  const edition = name === 'plusieurs langues du corpus' ? 'une édition suivie' : `l’édition en ${name.replace(/^le /, '')}`;
  const rest = summary
    .replace(/^(Nouvelle page|Mise à jour) de l’article « [^»]* » sur Wikipédia en [^.]+\.\s*/i, '')
    .trim();
  const dated = when === 'Date non précisée' ? 'Récemment' : `Le ${when}`;
  const comment = rest
    ? `<p>Le commentaire laissé sur la modification : ${esc(rest)}</p>`
    : '<p>Aucun commentaire utile n’accompagne la modification.</p>';
  return `<p>${esc(dated)}, ${esc(edition)} de Wikipédia ${esc(action)} l’article « ${esc(item.title)} ».</p>
    ${comment}
    <p>La fiche note le geste d’édition. Le texte de l’article lui-même se lit sur Wikipédia.</p>`;
}

function detail(data) {
  const item = data.item;
  const favLabel = data.favorite ? 'Retirer des favoris' : 'Enregistrer en favori';
  const favorite = data.user
    ? `<form method="post" action="/favoris">
        <input type="hidden" name="_csrf" value="${esc(data.csrf)}">
        <input type="hidden" name="item_id" value="${item.id}">
        <input type="hidden" name="next" value="/contenu/${item.id}">
        <button class="button button-ghost" type="submit">${icon(data.favorite ? 'out' : 'bookmark')}<span>${favLabel}</span></button>
      </form>`
    : `<a class="button button-ghost" href="/connexion?next=/contenu/${item.id}">${icon('key')}<span>Se connecter pour enregistrer</span></a>`;
  return page('fiche', data, item.title, 'veille', {
    lang_class: langClass(item.language),
    language: esc(item.language),
    title_html: esc(item.title),
    meta: slipMeta(item),
    published: formatDate(item.published_at),
    collected: formatDate(item.collected_at),
    body: detailBody(item),
    url: esc(safeUrl(item.url)),
    favorite,
  });
}

function dashboard(data) {
  const rows = (list, empty) => (list.length
    ? list.map((row) => `<tr><td>${esc(row.label)}</td><td>${formatNumber(row.count)}</td></tr>`).join('')
    : `<tr><td colspan="2">${empty}</td></tr>`);
  const keywords = data.keywords.length
    ? `<ul class="keywords">${data.keywords.map((word) => `<li><span>${esc(word.word)}</span><strong>${formatNumber(word.count)}</strong></li>`).join('')}</ul>`
    : stateBox('empty', 'Pas encore de mots', 'Les mots fréquents apparaîtront après la collecte.');
  const run = data.run
    ? `<p>Dernière collecte : ${formatDate(data.run.finished_at)} · ${formatNumber(data.run.added)} nouveau(x) contenu(s).</p>`
    : stateBox('empty', 'Aucune collecte terminée', 'Le premier passage est encore en cours, ou il n’a pas pu aboutir.');
  const alerts = data.run && data.run.errors
    ? `${stateBox('error', 'Une source n’a pas répondu', 'La dernière collecte s’est terminée avec des alertes. Les contenus déjà en base restent consultables.')}<details class="state-details"><summary>Détail technique</summary><pre>${esc(data.run.errors)}</pre></details>`
    : '';
  const emptyDash = data.sources.length
    ? ''
    : stateBox('empty', 'Pas encore de chiffres', 'Les graphiques apparaîtront après la première collecte réussie.');
  return page('tableau', data, 'Tableau de bord', 'dashboard', {
    running: '',
    run,
    alerts,
    empty_state: emptyDash,
    source_rows: rows(data.sources, 'Pas encore de données.'),
    theme_rows: rows(data.themes, 'Pas encore de données.'),
    language_rows: rows(data.languages, 'Pas encore de données.'),
    keywords,
    chart_json: data.chartJson,
    scripts: '<script src="/vendor/chart.umd.js"></script><script src="/app.js" defer></script>',
  });
}

function about(data) {
  return page('apropos', data, 'À propos', 'apropos');
}

function nextHint(next) {
  if (next.startsWith('/contenu/')) return 'Après validation, vous reviendrez sur la fiche en cours.';
  if (next.startsWith('/favoris')) return 'Après validation, vous ouvrirez vos favoris.';
  return '';
}

function authForm(data) {
  const isRegister = data.mode === 'register';
  const next = data.next || '/';
  const hint = nextHint(next);
  return page(isRegister ? 'inscription' : 'connexion', data, isRegister ? 'Créer un compte' : 'Connexion', 'connexion', {
    hint: hint ? `<p class="note">${esc(hint)}</p>` : '',
    error: data.error ? stateBox('error', isRegister ? 'Inscription refusée' : 'Connexion refusée', data.error, 'auth-error') : '',
    csrf: esc(data.csrf),
    next: esc(next),
    next_query: encodeURIComponent(next),
    email: esc(data.email || ''),
    name: esc(data.name || ''),
    invalid: data.error ? ' aria-invalid="true" aria-describedby="auth-error"' : '',
  });
}

function favoris(data) {
  const list = data.items.length
    ? `<div class="grid">${data.items.map(card).join('')}</div>`
    : stateBox('empty', 'Aucun favori', 'Ouvrez une fiche de la veille et enregistrez-la.');
  return page('favoris', data, 'Favoris', 'favoris', {
    name: esc(data.user.name),
    list,
  });
}

function messagePage(data) {
  const kind = data.kind === 'ok' ? 'ok' : 'error';
  return page('message', data, data.heading, '', {
    heading: esc(data.heading),
    message: esc(data.message),
    kind,
    role: kind === 'ok' ? 'status' : 'alert',
  });
}

module.exports = {
  SOURCES,
  THEMES,
  LANGUAGES,
  esc,
  home,
  veille,
  detail,
  dashboard,
  about,
  authForm,
  favoris,
  messagePage,
  queryString,
};
