# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
npm install              # Install dependencies
npm start                # Start server (runs bin/www, loads .env, creates dual HTTP/HTTPS servers)
node migration.js        # Create database tables and bootstrap admin user
```

No linter is configured.

```bash
npm test                 # Run all tests (Mocha)
npx mocha test/refs.test.js   # Run a single test file
```

Tests use **Mocha** + **Chai** (expect) + **Sinon** (stubs/spies) + **proxyquire** (dependency injection). Route tests use `proxyquire` to swap out external dependencies (Solr, filesystem, database, email) so tests run without any backend services. Shared mock factories for Express req/res/user objects are in `test/helpers.js`.

Middleware functions are in `server/middleware.js` (extracted from `app.js` for testability).

Utility scripts:
```bash
node tools/findHighestId.js [maxId]   # Find max Solr reference ID
node tools/countRefs.js [maxId]       # Count references in Solr
node tools/findRefGaps.js             # Find gaps in Solr reference IDs
```

## Architecture

Node.js/Express app that manages a Solr search database (references/sources) with authenticated editor access. The public-facing search site is a separate application (http://rad.creationeducation.org); this app is the admin backend.

### Request Flow

`bin/www` loads `.env` and starts dual HTTP/HTTPS servers. `app.js` configures the middleware pipeline in this order:

1. Morgan logging (skips static assets like fonts/stylesheets)
2. Body parser, cookie parser
3. MySQL-backed sessions (connect-session-knex)
4. Passport authentication initialization
5. Flash messages
6. **Solr proxy** (`/solr/*`) — validated GET-only proxy to local Solr instance (before static files)
7. Static files (`public/`)
8. SSL redirect (`forceSsl`)
9. Flash message collection (`flashMessageCenter`)
10. Bug tracker reverse proxy (`/tracker`)
11. Auth-gated static files (`/private/*` — requires `isLoggedIn`)
12. Route handlers

### Auth Middleware Chain

Four middleware functions defined in `server/middleware.js` and imported by `app.js`:
- **`isLoggedIn`** — checks `req.isAuthenticated()`, populates `req.replacements` with user context (email, name, permission flags). Redirects to `/login` if not authenticated.
- **`superuser`** — requires `permission >= 2`, redirects to `/profile` otherwise.
- **`flashMessageCenter`** — collects flash messages into `req.replacements` for templates.
- **`forceSsl`** — redirects non-root HTTP requests to HTTPS.

Permission levels: 0=basic user, 1=can delete refs, 2=admin (manages users).

### Route Organization

Routes in `routes/` are mounted in `app.js`. Key pattern: `req.replacements` is an object built up by middleware and passed to `res.render()` as the Handlebars context.

- **Public**: `/` (home), `/login`, `/logout`
- **Auth flows**: `/reset/:token`, `/signup` (both use `routes/reset.js`)
- **Protected** (isLoggedIn): `/profile`, `/refs` (main editor — full CRUD against Solr)
- **Admin** (isLoggedIn + superuser): `/users`, `/users/signup` (invite via email)
- **Stubs** (isLoggedIn, templates only): `/sources`, `/campaigns`, `/site`

### Solr Integration

The four full-text fields on the rad core (`author`, `title`, `reference`, `abstract`) use a custom field type `text_html_safe` defined in `tools/solr-setup.sh`. It's a clone of `text_general` with `solr.HTMLStripCharFilterFactory` prepended to the analyzer chain so docs imported with literal entities (`mendel&apos;s`) tokenize the same way as a user query (`mendel's`). `_text_` (the catch-all copyField destination) still uses stock `text_general` — see issue #118 follow-up notes.

Optional `type` field (`string`, single-valued, not in `_text_`) categorises refs for the public dropdown filter (issue #19). Allowed values live in `config/refTypes.js` — server validates POST bodies against the list, both `routes/refs.js` and `routes/index.js` pass it as render context for the templates' selects, and the public form's `type` URL param gets translated to a Solr `fq=type:"…"` filter in `public/javascripts/refGridView.js` so it doesn't perturb relevance scoring.

`config/solr-proxy.js` validates and proxies requests to the local Solr instance. Only GET requests to whitelisted paths (`/solr/rad/refs`, `/solr/rad/refs/csv`, `/solr/source/select`) are allowed; `qt` and `stream.*` params are blocked (403), and any request whose `rows` exceeds `proxyOptions.maxRows` (1000) is rejected with 400. The proxy refuses rather than silently clamps so client-side pagination stays consistent with what was returned. Reference CRUD in `routes/refs.js` uses `solr-client` to add/update/delete documents, then updates `database.json` (tracks numRecords, highestId, latest date).

`server/solr-stats.js` cursor-marks the rad core to recompute these three stats from the index, used by `POST /database/recompute` (admin-only) when deletes/edits leave database.json out of sync — e.g. removing the doc that contributed `latest`. The route compares scanned values to the current file via `database-json.replaceStats` and returns the diff; the diff renders in a modal on the database page.

### Frontend Pattern

Views use Handlebars with an **inline partials** layout pattern:
```hbs
{{#> layout title="Title" nav=1}}
  {{#*inline "search-area"}}...{{/inline}}
  {{#*inline "results-area"}}...{{/inline}}
  {{#*inline "modal-block"}}...{{/inline}}
  {{#*inline "scripts-block"}}...{{/inline}}
{{/layout}}
```

Client-side uses **Knockout.js** view models (`public/javascripts/`):
- `refViewModel.js` — binds the reference editor form, handles create/update/revert with observables
- `refGridView.js` — search results grid with client-side CSV generation
- `sourceViewModel.js` — AJAX source lookup

Auth-protected JS files live in `private/` and are served only after `isLoggedIn` middleware.

A `{{nonce}}` Handlebars helper injects the per-request CSP nonce into script tags.

### Database

MySQL via Knex/Bookshelf. Three tables (defined in `models/schema.js`, created by `migration.js`):
- **users**: email (unique), password_digest (bcrypt), name, permission (0/1/2), validated
- **campaigns**: name, description, refs (JSON array of reference IDs)
- **invitations**: token (PK), expires, user_id (FK) — used for password reset (1hr) and signup invites (24hr)

### Email

`config/mailer.js` wraps nodemailer with AWS SES transport. Three email types: password reset, user invitation, and password change confirmation.

## Environment Variables

All configured in `.env` (loaded by `bin/www` via dotenv). See README.md for the full list. Key ones: `DBUSER`, `DBUSERPASS`, `SESSIONKEY`, `HTTPPORT`, `HTTPSPORT`, `SSLKEY`, `SSLCERT`, `SOLRPORT`, AWS credentials, `BOOTSTRAP_ADMIN`/`BOOTSTRAP_PASS`.
