const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { init, getDb } = require('./lib/db');
const collect = require('./lib/collect');
const render = require('./lib/render');

init();

const app = express();
const port = Number(process.env.PORT) || 3000;
const PER_PAGE = 15;
const loginAttempts = new Map();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'minoko-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 14,
  },
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'self'; form-action 'self'"
  );
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.user = req.session.user || null;
  res.locals.csrf = req.session.csrf;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

app.get('/vendor/chart.umd.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules', 'chart.js', 'dist', 'chart.umd.js'));
});

function view(res, html) {
  res.type('html').send(html);
}

const NOTICES = {
  sortie: { kind: 'ok', title: 'Déconnexion', text: 'Vous êtes déconnecté.' },
};

function pageData(req) {
  return {
    user: req.session.user || null,
    csrf: req.session.csrf,
    flash: req._flashShown || NOTICES[req.query.notice] || null,
    running: collect.getStatus().running,
  };
}

app.use((req, res, next) => {
  req._flashShown = res.locals.flash;
  next();
});

function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('://')) {
    return '/';
  }
  return value;
}

function checkCsrf(req, res) {
  const sent = req.body && req.body._csrf;
  const expected = req.session.csrf;
  if (!sent || !expected || sent.length !== expected.length) {
    view(res.status(403), render.messagePage({
      ...pageData(req),
      heading: 'Requête refusée',
      message: 'Le formulaire a expiré. Rechargez la page et recommencez.',
    }));
    return false;
  }
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    view(res.status(403), render.messagePage({
      ...pageData(req),
      heading: 'Requête refusée',
      message: 'Le formulaire a expiré. Rechargez la page et recommencez.',
    }));
    return false;
  }
  return true;
}

function clientIp(req) {
  return req.ip || 'local';
}

function tooManyAttempts(req) {
  const entry = loginAttempts.get(clientIp(req));
  return entry && entry.count >= 8 && entry.until > Date.now();
}

function markAttempt(req, success) {
  const key = clientIp(req);
  if (success) {
    loginAttempts.delete(key);
    return;
  }
  const entry = loginAttempts.get(key) || { count: 0, until: Date.now() + 15 * 60 * 1000 };
  entry.count += 1;
  entry.until = Date.now() + 15 * 60 * 1000;
  loginAttempts.set(key, entry);
}

function counts() {
  const db = getDb();
  return {
    total: db.prepare('SELECT COUNT(*) AS n FROM items').get().n,
  };
}

function grouped(column) {
  const allowed = { source: 'source', theme: 'theme', language: 'language' };
  const field = allowed[column];
  return getDb().prepare(
    `SELECT ${field} AS label, COUNT(*) AS count FROM items GROUP BY ${field} ORDER BY count DESC`
  ).all();
}

app.get('/', (req, res) => {
  const db = getDb();
  const featured = db.prepare(`
    SELECT * FROM items WHERE source != 'Wikipédia'
    ORDER BY COALESCE(published_at, collected_at) DESC LIMIT 1
  `).get();
  const latest = db.prepare(`
    SELECT * FROM items WHERE source != 'Wikipédia' AND id != ?
    ORDER BY COALESCE(published_at, collected_at) DESC LIMIT 3
  `).all(featured ? featured.id : 0);
  const wiki = db.prepare(`
    SELECT * FROM items WHERE source = 'Wikipédia'
    ORDER BY COALESCE(published_at, collected_at) DESC LIMIT 3
  `).all();
  view(res, render.home({
    ...pageData(req),
    featured,
    latest,
    wiki,
    counts: counts(),
    running: collect.getStatus().running,
  }));
});

app.get('/veille', (req, res) => {
  const filters = {
    q: String(req.query.q || '').trim().slice(0, 80),
    source: render.SOURCES.includes(req.query.source) ? req.query.source : '',
    theme: render.THEMES.includes(req.query.theme) ? req.query.theme : '',
    langue: render.LANGUAGES.includes(req.query.langue) ? req.query.langue : '',
    du: /^\d{4}-\d{2}-\d{2}$/.test(req.query.du || '') ? req.query.du : '',
    au: /^\d{4}-\d{2}-\d{2}$/.test(req.query.au || '') ? req.query.au : '',
  };
  const where = [];
  const params = [];
  if (filters.q) {
    const like = `%${filters.q.replace(/[%_]/g, '')}%`;
    where.push('(title LIKE ? COLLATE NOCASE OR summary LIKE ? COLLATE NOCASE)');
    params.push(like, like);
  }
  if (filters.source) {
    where.push('source = ?');
    params.push(filters.source);
  }
  if (filters.theme) {
    where.push('theme = ?');
    params.push(filters.theme);
  }
  if (filters.langue) {
    where.push('language = ?');
    params.push(filters.langue);
  }
  if (filters.du) {
    where.push('published_at >= ?');
    params.push(filters.du);
  }
  if (filters.au) {
    where.push('published_at <= ?');
    params.push(`${filters.au}T23:59:59`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const db = getDb();
  const total = db.prepare(`SELECT COUNT(*) AS n FROM items ${clause}`).get(...params).n;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
  const items = db.prepare(
    `SELECT * FROM items ${clause} ORDER BY COALESCE(published_at, collected_at) DESC LIMIT ? OFFSET ?`
  ).all(...params, PER_PAGE, (page - 1) * PER_PAGE);
  view(res, render.veille({ ...pageData(req), items, total, page, pages, filters }));
});

app.get('/contenu/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = Number.isInteger(id)
    ? getDb().prepare('SELECT * FROM items WHERE id = ?').get(id)
    : null;
  if (!item) {
    view(res.status(404), render.messagePage({
      ...pageData(req),
      heading: 'Contenu introuvable',
      message: 'Ce signal n’est plus dans la base, ou le lien est incomplet.',
    }));
    return;
  }
  let favorite = false;
  if (req.session.user) {
    favorite = Boolean(getDb().prepare(
      'SELECT 1 AS ok FROM favorites WHERE user_id = ? AND item_id = ?'
    ).get(req.session.user.id, item.id));
  }
  view(res, render.detail({ ...pageData(req), item, favorite }));
});

app.get('/tableau-de-bord', (req, res) => {
  const sources = grouped('source');
  const themes = grouped('theme');
  const languages = grouped('language');
  const titles = getDb().prepare('SELECT title FROM items').all();
  const stop = new Set('les des une pour dans avec sur par the and for from that this avec une des les du au aux en un une ou où de la le d l a à et ou son sa ses qui que quoi dont dont sur'.split(/\s+/));
  const freq = new Map();
  titles.forEach((row) => {
    String(row.title).toLowerCase().split(/[^a-zàâçéèêëîïôùûüœ0-9]+/i).forEach((word) => {
      if (word.length < 4 || stop.has(word)) return;
      freq.set(word, (freq.get(word) || 0) + 1);
    });
  });
  const keywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word, count]) => ({ word, count }));
  const run = getDb().prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 1').get();
  const chartJson = JSON.stringify({ sources, themes }).replace(/</g, '\\u003c');
  view(res, render.dashboard({
    ...pageData(req),
    sources,
    themes,
    languages,
    keywords,
    run,
    status: collect.getStatus(),
    chartJson,
  }));
});

app.get('/a-propos', (req, res) => {
  view(res, render.about(pageData(req)));
});

app.get('/favoris', (req, res) => {
  if (!req.session.user) {
    res.redirect('/connexion?next=/favoris');
    return;
  }
  const items = getDb().prepare(`
    SELECT items.* FROM favorites
    JOIN items ON items.id = favorites.item_id
    WHERE favorites.user_id = ?
    ORDER BY favorites.created_at DESC
  `).all(req.session.user.id);
  view(res, render.favoris({ ...pageData(req), items }));
});

app.get('/connexion', (req, res) => {
  view(res, render.authForm({ ...pageData(req), mode: 'login', next: safeNext(req.query.next) }));
});

app.get('/inscription', (req, res) => {
  view(res, render.authForm({ ...pageData(req), mode: 'register', next: safeNext(req.query.next) }));
});

function openSession(req, user, nextUrl, done) {
  req.session.regenerate((error) => {
    if (error) {
      done(error);
      return;
    }
    req.session.user = { id: user.id, name: user.name, email: user.email };
    req.session.csrf = crypto.randomBytes(24).toString('hex');
    req.session.flash = {
      kind: 'ok',
      title: 'Connexion',
      text: req._loginNotice || 'Vous êtes connecté.',
    };
    req.session.save(() => done(null));
  });
}

app.post('/inscription', async (req, res) => {
  if (!checkCsrf(req, res)) return;
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const nextUrl = safeNext(req.body.next);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (name.length < 2 || name.length > 80 || !emailOk || password.length < 8 || password.length > 80) {
    view(res.status(400), render.authForm({
      ...pageData(req),
      mode: 'register',
      name,
      email,
      next: nextUrl,
      error: 'Vérifiez le nom, une adresse e-mail valide et un mot de passe d’au moins 8 caractères.',
    }));
    return;
  }
  const existing = getDb().prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    view(res.status(400), render.authForm({
      ...pageData(req),
      mode: 'register',
      name,
      email,
      next: nextUrl,
      error: 'Un compte existe déjà avec cette adresse e-mail.',
    }));
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const created = getDb().prepare(
    'INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)'
  ).run(name, email, passwordHash, new Date().toISOString());
  req._loginNotice = 'Compte créé. Vous êtes connecté.';
  openSession(req, { id: Number(created.lastInsertRowid), name, email }, nextUrl, (error) => {
    if (error) {
      view(res.status(500), render.messagePage({
        ...pageData(req),
        heading: 'Compte créé, connexion impossible',
        message: 'Le compte est enregistré. Réessayez depuis la page de connexion.',
      }));
      return;
    }
    res.redirect(nextUrl);
  });
});

app.post('/connexion', async (req, res) => {
  if (!checkCsrf(req, res)) return;
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const nextUrl = safeNext(req.body.next);
  if (tooManyAttempts(req)) {
    view(res.status(429), render.authForm({
      ...pageData(req),
      mode: 'login',
      email,
      next: nextUrl,
      error: 'Trop de tentatives. Réessayez dans quelques minutes.',
    }));
    return;
  }
  const user = getDb().prepare('SELECT * FROM users WHERE email = ?').get(email);
  const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
  markAttempt(req, ok);
  if (!ok) {
    view(res.status(401), render.authForm({
      ...pageData(req),
      mode: 'login',
      email,
      next: nextUrl,
      error: 'Identifiants incorrects.',
    }));
    return;
  }
  openSession(req, user, nextUrl, (error) => {
    if (error) {
      view(res.status(500), render.messagePage({
        ...pageData(req),
        heading: 'Connexion impossible',
        message: 'La session n’a pas pu être ouverte. Réessayez.',
      }));
      return;
    }
    res.redirect(nextUrl);
  });
});

app.post('/deconnexion', (req, res) => {
  if (!checkCsrf(req, res)) return;
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/?notice=sortie');
  });
});

app.post('/favoris', (req, res) => {
  if (!checkCsrf(req, res)) return;
  if (!req.session.user) {
    res.redirect('/connexion?next=/favoris');
    return;
  }
  const itemId = Number(req.body.item_id);
  const nextUrl = safeNext(req.body.next || '/favoris');
  const item = Number.isInteger(itemId)
    ? getDb().prepare('SELECT id FROM items WHERE id = ?').get(itemId)
    : null;
  if (!item) {
    req.session.flash = {
      kind: 'error',
      title: 'Favori impossible',
      text: 'Ce contenu n’est plus dans la base.',
    };
    res.redirect('/veille');
    return;
  }
  const db = getDb();
  const existing = db.prepare(
    'SELECT 1 AS ok FROM favorites WHERE user_id = ? AND item_id = ?'
  ).get(req.session.user.id, item.id);
  if (existing) {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND item_id = ?').run(req.session.user.id, item.id);
    req.session.flash = {
      kind: 'ok',
      title: 'Favori retiré',
      text: 'Ce contenu n’est plus dans votre sélection.',
    };
  } else {
    db.prepare('INSERT INTO favorites (user_id, item_id, created_at) VALUES (?, ?, ?)').run(
      req.session.user.id,
      item.id,
      new Date().toISOString()
    );
    req.session.flash = {
      kind: 'ok',
      title: 'Favori enregistré',
      text: 'Vous le retrouverez dans votre liste de favoris.',
    };
  }
  res.redirect(nextUrl);
});

app.use((req, res) => {
  view(res.status(404), render.messagePage({
    ...pageData(req),
    heading: 'Page introuvable',
    message: 'Cette adresse ne correspond à aucune page de Minoko.',
  }));
});

app.listen(port, () => {
  console.log(`Minoko écoute sur http://localhost:${port}`);
  collect.startScheduler();
});
