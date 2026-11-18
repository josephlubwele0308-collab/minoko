# Minoko — veille des langues congolaises

Site de veille technologique réalisé par **LUBWELE KABUNDI Joseph** (Master 2 Communication Numérique, Université Don Bosco de Lubumbashi) pour le cours de Développement Web Avancé, année 2026-2027.

**Public :** chercheurs, développeurs, médias communautaires et ONG qui ont besoin de savoir quels outils existent — et lesquels manquent — pour le lingala, le swahili, le tshiluba et le kikongo.

## Ce que fait le site

- Il interroge quatre sources et enregistre les résultats dans une base SQLite, sans doublon (un même document garde une seule fiche, mise à jour à la collecte suivante).
- La collecte part au lancement, puis toutes les six heures, sans action manuelle.
- La page Veille permet de chercher par mots-clés et de filtrer par source, thème, langue et dates.
- Chaque fiche indique la source, la date, la langue, le thème, un extrait, et un lien vers l’original.
- Le tableau de bord compte les contenus par source, par thème et par langue, liste les mots fréquents des titres, et affiche deux graphiques.
- Un compte (empreinte de mot de passe, session) permet d’enregistrer des favoris.

## Sources

| Source | Rôle | Accès |
| --- | --- | --- |
| Hugging Face Hub API | Modèles et jeux de données | `https://huggingface.co/api/models` et `/api/datasets` |
| arXiv API | Prépublications | `https://export.arxiv.org/api/query` |
| GitHub REST API | Dépôts publics | `https://api.github.com/search/repositories` |
| API MediaWiki | Activité des Wikipédia ln, sw et kg | `https://{ln,sw,kg}.wikipedia.org/w/api.php` |

Thèmes retenus : traduction automatique, reconnaissance vocale, synthèse vocale, modèles de langue, jeux de données, ressources ouvertes.

## Technologies

Le cours a couvert HTML, CSS et JavaScript. Le site reste sur cette base côté navigateur : pages générées par le serveur, formulaires classiques, un seul script pour les graphiques.

Node.js et Express portent les comptes, la planification et les appels aux API. Ces appels ne peuvent pas tous partir du navigateur (pas d’en-tête CORS, et la collecte doit continuer sans visiteur). SQLite (`node:sqlite`, inclus dans Node 22+) stocke les contenus, les comptes et l’historique des collectes dans `data/minoko.db`. Les mots de passe passent par bcrypt. Chart.js dessine les graphiques ; les mêmes chiffres sont aussi dans des tableaux, pour rester lisibles sans le script.

## Lancer en local

Node.js 22 ou plus récent est requis.

```bash
npm install
npm start
```

Puis ouvrir `http://localhost:3000`. La première collecte prend une à deux minutes.

Variables utiles :

- `PORT` — port HTTP (3000 par défaut)
- `SESSION_SECRET` — secret de session, à définir dès que le site est public
- `DATA_DIR` — dossier de la base, si l’hébergeur fournit un disque persistant
- `NODE_ENV=production` — cookie de session uniquement en HTTPS

## Déploiement

Le site doit être accessible par une adresse publique le jour de la soutenance. Sur un service du type Render ou Railway :

1. Pousser ce dossier dans un dépôt GitHub public.
2. Créer un service web : build `npm install`, start `npm start`.
3. Définir `SESSION_SECRET` et `NODE_ENV=production`.
4. Monter un disque persistant sur le dossier indiqué par `DATA_DIR`, sinon les comptes et les favoris disparaissent à chaque redémarrage. Les contenus, eux, sont recollectés au démarrage.

## Limites

L’échantillon n’est pas un inventaire complet : quelques résultats par langue et par source. Le swahili des modèles publics est en général le swahili standard, pas le swahili congolais. Wikipédia en kg suit surtout le kituba. Il n’y a pas de Wikipédia en tshiluba.

## Soutenance

Vendredi 20 novembre 2026, 18 h 50.
