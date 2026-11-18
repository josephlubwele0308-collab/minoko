const { getDb } = require('./db');

const UA = 'MinokoVeille/1.0 (travail pratique UDBL; langues congolaises)';
const EVERY_MS = 6 * 60 * 60 * 1000;

const LANG_TERMS = [
  { term: 'lingala', language: 'Lingala' },
  { term: 'swahili', language: 'Swahili' },
  { term: 'tshiluba', language: 'Tshiluba' },
  { term: 'ciluba', language: 'Tshiluba' },
  { term: 'kikongo', language: 'Kikongo' },
  { term: 'kituba', language: 'Kikongo' },
];

const WIKIS = [
  { code: 'ln', language: 'Lingala', host: 'ln.wikipedia.org' },
  { code: 'sw', language: 'Swahili', host: 'sw.wikipedia.org' },
  { code: 'kg', language: 'Kikongo', host: 'kg.wikipedia.org' },
];

const PIPELINE_FR = {
  'fill-mask': 'modèle de langue masqué',
  'text-generation': 'génération de texte',
  translation: 'traduction automatique',
  'automatic-speech-recognition': 'reconnaissance vocale',
  'text-to-speech': 'synthèse vocale',
  'text-classification': 'classification de texte',
  'token-classification': 'annotation linguistique',
  'sentence-similarity': 'similarité de phrases',
  'zero-shot-classification': 'classification zero-shot',
  summarization: 'résumé automatique',
  'question-answering': 'questions-réponses',
  'feature-extraction': 'extraction de représentations',
  'text-to-audio': 'synthèse vocale',
  'audio-classification': 'classification audio',
};

let status = {
  running: false,
  startedAt: null,
  finishedAt: null,
  added: 0,
  errors: [],
};

function getStatus() {
  return status;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, headers = {}, timeout = 20000) {
  const response = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json, application/xml, text/xml, */*', ...headers },
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchJson(url, headers) {
  const text = await fetchText(url, headers);
  return JSON.parse(text);
}

function detectLanguage(text, fallback) {
  const t = String(text || '').toLowerCase();
  const hits = [];
  if (t.includes('lingala')) hits.push('Lingala');
  if (t.includes('swahili') || t.includes('kiswahili')) hits.push('Swahili');
  if (t.includes('tshiluba') || t.includes('ciluba') || t.includes('luba-kasai')) hits.push('Tshiluba');
  if (t.includes('kikongo') || t.includes('kituba')) hits.push('Kikongo');
  if (hits.length > 1) return 'Plusieurs';
  if (hits.length === 1) return hits[0];
  return fallback;
}

function detectTheme({ text, pipeline, kind }) {
  if (kind === 'dataset') return 'Jeux de données';
  if (kind === 'wiki') return 'Ressources ouvertes';
  const blob = `${pipeline || ''} ${text || ''}`.toLowerCase();
  if (/tts|vits|text-to-speech|text-to-audio|speech synthesis|synth[eè]se vocale/.test(blob)) {
    return 'Synthèse vocale';
  }
  if (/automatic-speech-recognition|speech-recognition|reconnaissance vocale|\basr\b|whisper|wav2vec/.test(blob)) {
    return 'Reconnaissance vocale';
  }
  if (/translation|traduction|\bnmt\b|opus-mt|m2m100|nllb/.test(blob)) {
    return 'Traduction automatique';
  }
  if (/dataset|corpus|jeux de donn/.test(blob)) return 'Jeux de données';
  return 'Modèles de langue';
}

function stripWiki(text) {
  return String(text || '')
    .replace(/\[\[(?:[^|\]]+\|)?([^\]]+)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\[https?:\/\/[^\s\]]+\s*([^\]]*)\]/g, '$1');
}

function clip(text, max = 700) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

function insertItem(item) {
  const db = getDb();
  db.prepare(`
    INSERT INTO items
      (external_id, source, title, summary, url, published_at, language, theme, collected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(external_id) DO UPDATE SET
      title = excluded.title,
      summary = excluded.summary,
      url = excluded.url,
      published_at = excluded.published_at,
      language = excluded.language,
      theme = excluded.theme,
      collected_at = excluded.collected_at
  `).run(
    item.external_id,
    item.source,
    clip(item.title, 240),
    clip(item.summary, 900),
    item.url,
    item.published_at,
    item.language,
    item.theme,
    new Date().toISOString()
  );
}

async function collectHuggingFace(errors) {
  for (const { term, language } of LANG_TERMS) {
    for (const kind of ['models', 'datasets']) {
      try {
        const rows = await fetchJson(
          `https://huggingface.co/api/${kind}?search=${encodeURIComponent(term)}&limit=8`
        );
        for (const row of rows) {
          const id = row.id || row.modelId;
          if (!id) continue;
          const blob = `${id} ${(row.tags || []).join(' ')} ${row.pipeline_tag || ''}`.toLowerCase();
          if (!blob.includes(term)) continue;
          const pipeline = PIPELINE_FR[row.pipeline_tag] || row.pipeline_tag;
          const downloads = Number(row.downloads || 0).toLocaleString('fr-FR');
          const isDataset = kind === 'datasets';
          const summary = isDataset
            ? `Jeu de données public « ${id} », repéré par le terme « ${term} ». ${downloads} téléchargements.`
            : `Modèle public « ${id} ». Tâche : ${pipeline || 'non précisée'}. ${downloads} téléchargements.`;
          insertItem({
            external_id: `hf:${kind}:${id}`,
            source: 'Hugging Face',
            title: id,
            summary,
            url: isDataset ? `https://huggingface.co/datasets/${id}` : `https://huggingface.co/${id}`,
            published_at: row.createdAt || row.lastModified || null,
            language: detectLanguage(`${id} ${term}`, language),
            theme: detectTheme({ text: `${id} ${term} ${summary}`, pipeline: row.pipeline_tag, kind: isDataset ? 'dataset' : 'model' }),
          });
        }
      } catch (error) {
        errors.push(`Hugging Face (${term}, ${kind}) : ${error.message}`);
      }
      await wait(250);
    }
  }
}

function unescapeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(entry, name) {
  const match = entry.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? unescapeXml(match[1]) : '';
}

async function collectArxiv(errors) {
  const query = 'all:lingala OR all:tshiluba OR all:ciluba OR all:kikongo OR all:kituba OR all:kingwana OR (ti:swahili AND (all:translation OR all:speech OR all:corpus))';
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&start=0&max_results=15&sortBy=submittedDate&sortOrder=descending`;
  let xml = '';
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      xml = await fetchText(url, { Accept: 'application/atom+xml' }, 35000);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      await wait(5000);
    }
  }
  if (lastError) {
    errors.push(`arXiv : ${lastError.message}`);
    return;
  }
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  for (const entry of entries) {
    const id = tag(entry, 'id');
    const title = tag(entry, 'title');
    const summary = tag(entry, 'summary');
    const published = tag(entry, 'published');
    const arxivId = id.split('/abs/').pop();
    if (!arxivId || !title) continue;
    const language = detectLanguage(`${title} ${summary}`, 'Plusieurs');
    const blob = `${title} ${summary}`;
    if (!/lingala|swahili|kiswahili|tshiluba|ciluba|kikongo|kituba|kingwana/i.test(blob)) continue;
    insertItem({
      external_id: `arxiv:${arxivId}`,
      source: 'arXiv',
      title,
      summary: summary || 'Prépublication scientifique sans résumé fourni.',
      url: `https://arxiv.org/abs/${arxivId.replace(/^https?:\/\/arxiv\.org\/abs\//, '')}`,
      published_at: published || null,
      language,
      theme: detectTheme({ text: blob, kind: 'paper' }),
    });
  }
}

async function collectGitHub(errors) {
  for (const { term, language } of LANG_TERMS) {
    try {
      const q = encodeURIComponent(`${term} in:name,description fork:false`);
      const data = await fetchJson(
        `https://api.github.com/search/repositories?q=${q}&sort=updated&per_page=8`,
        { Accept: 'application/vnd.github+json' }
      );
      for (const repo of data.items || []) {
        const name = String(repo.name || '').toLowerCase();
        const description = String(repo.description || '').toLowerCase();
        if (!name.includes(term) && !description.includes(term)) continue;
        const blob = `${repo.name} ${repo.description || ''}`;
        const stars = Number(repo.stargazers_count || 0).toLocaleString('fr-FR');
        insertItem({
          external_id: `gh:${repo.full_name}`,
          source: 'GitHub',
          title: repo.full_name,
          summary: clip(repo.description || `Dépôt de code lié à « ${term} », sans description.`, 500) + ` ${stars} étoiles.`,
          url: repo.html_url,
          published_at: repo.updated_at || repo.created_at || null,
          language: detectLanguage(blob, language),
          theme: detectTheme({ text: blob, kind: 'repo' }),
        });
      }
    } catch (error) {
      errors.push(`GitHub (${term}) : ${error.message}`);
    }
    await wait(1200);
  }
}

async function collectWikipedia(errors) {
  for (const wiki of WIKIS) {
    try {
      const params = new URLSearchParams({
        action: 'query',
        list: 'recentchanges',
        rcnamespace: '0',
        rclimit: '8',
        rctype: 'new|edit',
        rcshow: '!bot',
        rcprop: 'title|timestamp|ids|comment',
        format: 'json',
      });
      const data = await fetchJson(`https://${wiki.host}/w/api.php?${params}`);
      const changes = data.query?.recentchanges || [];
      for (const change of changes) {
        const title = change.title;
        if (!title) continue;
        const comment = clip(stripWiki(change.comment || ''), 220);
        const kind = change.type === 'new' ? 'Nouvelle page' : 'Mise à jour';
        insertItem({
          external_id: `wiki:${wiki.code}:${change.pageid}`,
          source: 'Wikipédia',
          title,
          summary: comment
            ? `${kind} de l’article « ${title} » sur Wikipédia en ${wiki.language.toLowerCase()}. ${comment}`
            : `${kind} de l’article « ${title} » sur Wikipédia en ${wiki.language.toLowerCase()}.`,
          url: `https://${wiki.host}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
          published_at: change.timestamp,
          language: wiki.language,
          theme: 'Ressources ouvertes',
        });
      }
    } catch (error) {
      errors.push(`Wikipédia ${wiki.language} : ${error.message}`);
    }
    await wait(300);
  }
}

async function collectAll() {
  if (status.running) return status;
  status = { running: true, startedAt: new Date().toISOString(), finishedAt: null, added: 0, errors: [] };
  const db = getDb();
  const before = db.prepare('SELECT COUNT(*) AS n FROM items').get().n;
  const errors = [];
  try {
    await collectHuggingFace(errors);
    await collectArxiv(errors);
    await collectGitHub(errors);
    await collectWikipedia(errors);
  } catch (error) {
    errors.push(error.message);
  } finally {
    const after = db.prepare('SELECT COUNT(*) AS n FROM items').get().n;
    status.running = false;
    status.finishedAt = new Date().toISOString();
    status.added = Math.max(0, after - before);
    status.errors = errors;
    db.prepare('INSERT INTO runs (started_at, finished_at, added, errors) VALUES (?, ?, ?, ?)').run(
      status.startedAt,
      status.finishedAt,
      status.added,
      errors.join('\n')
    );
    console.log(`Collecte terminée : +${status.added} contenu(s), ${errors.length} alerte(s).`);
  }
  return status;
}

function startScheduler() {
  collectAll().catch((error) => console.error(error));
  setInterval(() => {
    collectAll().catch((error) => console.error(error));
  }, EVERY_MS);
}

module.exports = { collectAll, startScheduler, getStatus, EVERY_MS };
