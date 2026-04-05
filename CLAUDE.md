# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
npm install              # Install dependencies
npm start                # Start server (runs bin/www, loads .env, creates dual HTTP/HTTPS servers)
node migration.js        # Create database tables and bootstrap admin user
```

No test framework is configured. No linter is configured.

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

Three middleware functions gate routes in `app.js`:
- **`isLoggedIn`** — checks `req.isAuthenticated()`, populates `req.replacements` with user context (email, name, permission flags). Redirects to `/login` if not authenticated.
- **`superuser`** — requires `permission >= 2`, redirects to `/profile` otherwise.
- **`flashMessageCenter`** — collects flash messages into `req.replacements` for templates.

Permission levels: 0=basic user, 1=can delete refs, 2=admin (manages users).

### Route Organization

Routes in `routes/` are mounted in `app.js`. Key pattern: `req.replacements` is an object built up by middleware and passed to `res.render()` as the Handlebars context.

- **Public**: `/` (home), `/login`, `/logout`
- **Auth flows**: `/reset/:token`, `/signup` (both use `routes/reset.js`)
- **Protected** (isLoggedIn): `/profile`, `/refs` (main editor — full CRUD against Solr)
- **Admin** (isLoggedIn + superuser): `/users`, `/users/signup` (invite via email)
- **Stubs** (isLoggedIn, templates only): `/sources`, `/campaigns`, `/site`

### Solr Integration

`config/solr-proxy.js` validates and proxies requests to the local Solr instance. Only GET requests to whitelisted paths (`/solr/rad/refs`, `/solr/rad/refs/csv`, `/solr/source/select`) are allowed; `qt` and `stream.*` params are blocked. Reference CRUD in `routes/refs.js` uses `solr-client` to add/update/delete documents, then updates `database.json` (tracks numRecords, highestId, latest date).

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
