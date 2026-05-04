#!/bin/bash
#
# Solr Schema and Configuration Setup for rad-admin
#
# Creates and configures the 'rad' (references) and 'source' cores
# for a new Solr 9 installation. Run once after installing Solr.
#
# Prerequisites:
#   - Solr 9 running and accessible
#   - No existing 'rad' or 'source' cores (or delete them first)
#
# Usage: ./solr-setup.sh [SOLR_URL]
#   SOLR_URL defaults to http://localhost:8983

set -e

SOLR_URL="${1:-http://localhost:8983}"

# Standalone Solr (this app's deployment target — not SolrCloud) shares the
# `_default` configset by reference when CREATE is given configSet=_default,
# which means schema mutations on one core leak to every other core that uses
# the same configset. The Configsets API CREATE that would clone configsets
# only works in SolrCloud, so we clone _default per-core on disk via cp.
# That requires running this script on the Solr host with filesystem access.
#
# SOLR_HOME defaults to whatever the running Solr reports for its solr_home.
# Override via the SOLR_HOME env var if discovery fails (e.g. proxied URL).
SOLR_HOME="${SOLR_HOME:-$(curl -sf "$SOLR_URL/solr/admin/info/system" \
  | node -e 'let d=""; process.stdin.on("data",c=>d+=c); process.stdin.on("end",()=>{try{process.stdout.write(JSON.parse(d).solr_home||"")}catch(_){}})' 2>/dev/null)}"
# Normalize Windows backslashes to forward slashes for bash path handling.
SOLR_HOME="${SOLR_HOME//\\//}"

echo "=== rad-admin Solr Setup ==="
echo "Solr URL:  $SOLR_URL"
echo "Solr home: $SOLR_HOME"
echo ""

if [ -z "$SOLR_HOME" ] || [ ! -d "$SOLR_HOME/configsets/_default" ]; then
  echo "Error: could not locate SOLR_HOME with a _default configset."
  echo "Set SOLR_HOME explicitly, e.g. SOLR_HOME=/var/solr/data ./solr-setup.sh"
  exit 1
fi

# ============================================================
# 1. Clone _default into a dedicated configset per core, then create
#    each core against its own configset (so schema mutations stay isolated).
# ============================================================

echo "--- Cloning configsets ---"

echo "Cloning _default -> rad_config..."
rm -rf "$SOLR_HOME/configsets/rad_config"
cp -r "$SOLR_HOME/configsets/_default" "$SOLR_HOME/configsets/rad_config"
echo "  OK"

echo "Cloning _default -> source_config..."
rm -rf "$SOLR_HOME/configsets/source_config"
cp -r "$SOLR_HOME/configsets/_default" "$SOLR_HOME/configsets/source_config"
echo "  OK"

echo ""
echo "--- Creating cores ---"

echo "Creating 'rad' core..."
curl -sf "$SOLR_URL/solr/admin/cores?action=CREATE&name=rad&configSet=rad_config" > /dev/null
echo "  OK"

echo "Creating 'source' core..."
curl -sf "$SOLR_URL/solr/admin/cores?action=CREATE&name=source&configSet=source_config" > /dev/null
echo "  OK"

# ============================================================
# 2. RAD core schema (references)
#
# Fields:
#   id        - integer document ID (stored as string, managed by database.json)
#   author    - text, full-text searchable
#   title     - text, full-text searchable
#   dt        - ISO 8601 date string (stored as string to support reduced
#               precision: year-only "2024", year-month "2024-03")
#   year      - integer year extracted from dt, used in relevance boost
#   reference - text, full-text searchable (reference type/format)
#   source    - string, exact match (validated against source core)
#   page      - string
#   abstract  - text, full-text searchable
#   _text_    - catch-all text field for default search (copy field target)
#
# The _default configset includes _text_ as text_general and a wildcard
# copy field (* -> _text_). We remove the wildcard and add explicit copy
# fields so only relevant content is searched.
# ============================================================

echo ""
echo "--- Configuring 'rad' core schema ---"

# Remove the default wildcard copy field so we control what is searchable.
# Solr 9's _default configset doesn't include this directive, so the call
# returns 400 — we don't pass -f and ignore the response; the goal is "make
# sure the wildcard is gone" and a missing one already satisfies that.
echo "Removing wildcard copy field (no-op if not present)..."
curl -s -X POST -H 'Content-type:application/json' \
  "$SOLR_URL/solr/rad/schema" -d '{
  "delete-copy-field": { "source": "*", "dest": "_text_" }
}' > /dev/null
echo "  OK"

# Custom analyzer that prepends HTMLStripCharFilter to text_general's chain.
# Strips HTML tags and decodes entities (&apos;, &amp;, &quot;, &#39;, …)
# at both index and query time, so a doc imported as "mendel&apos;s" tokenizes
# the same way as a user typing "mendel's". See issue #118 (#14 root cause).
# Cloned rather than modifying text_general so other fields are unaffected.
echo "Adding text_html_safe field type..."
curl -sf -X POST -H 'Content-type:application/json' \
  "$SOLR_URL/solr/rad/schema" -d '{
  "add-field-type": {
    "name": "text_html_safe",
    "class": "solr.TextField",
    "positionIncrementGap": "100",
    "analyzer": {
      "charFilters": [
        { "class": "solr.HTMLStripCharFilterFactory" }
      ],
      "tokenizer": { "class": "solr.StandardTokenizerFactory" },
      "filters": [
        { "class": "solr.LowerCaseFilterFactory" }
      ]
    }
  }
}' > /dev/null
echo "  OK"

echo "Adding reference fields and copy fields..."
curl -sf -X POST -H 'Content-type:application/json' \
  "$SOLR_URL/solr/rad/schema" -d '{
  "add-field": [
    { "name": "author",    "type": "text_html_safe", "stored": true, "indexed": true, "multiValued": false },
    { "name": "title",     "type": "text_html_safe", "stored": true, "indexed": true, "multiValued": false },
    { "name": "dt",        "type": "string",         "stored": true, "indexed": true, "multiValued": false },
    { "name": "year",      "type": "pint",           "stored": true, "indexed": true, "multiValued": false },
    { "name": "reference", "type": "text_html_safe", "stored": true, "indexed": true, "multiValued": false },
    { "name": "source",    "type": "string",         "stored": true, "indexed": true, "multiValued": false },
    { "name": "publisher", "type": "string",         "stored": true, "indexed": true, "multiValued": false },
    { "name": "page",      "type": "string",         "stored": true, "indexed": true, "multiValued": false },
    { "name": "type",       "type": "string",         "stored": true, "indexed": true, "multiValued": false },
    { "name": "abstract",   "type": "text_html_safe", "stored": true, "indexed": true, "multiValued": false },
    { "name": "rev_author", "type": "text_html_safe", "stored": true, "indexed": true, "multiValued": false },
    { "name": "rev_title",  "type": "text_html_safe", "stored": true, "indexed": true, "multiValued": false },
    { "name": "rev_source", "type": "text_html_safe", "stored": true, "indexed": true, "multiValued": false }
  ],
  "add-copy-field": [
    { "source": "author",     "dest": "_text_" },
    { "source": "title",      "dest": "_text_" },
    { "source": "reference",  "dest": "_text_" },
    { "source": "source",     "dest": "_text_" },
    { "source": "publisher",  "dest": "_text_" },
    { "source": "abstract",   "dest": "_text_" },
    { "source": "page",       "dest": "_text_" },
    { "source": "rev_author", "dest": "_text_" },
    { "source": "rev_title",  "dest": "_text_" },
    { "source": "rev_source", "dest": "_text_" }
  ]
}' > /dev/null
echo "  OK"

# ============================================================
# 3. RAD core request handler and spellcheck
#
# Custom /refs handler using edismax with:
#   - Default field: _text_ (catches unqualified queries)
#   - Boost: recip(sub(2029, year), 0.3, 1, 1) — recent documents rank higher
#   - Spellcheck via DirectSolrSpellChecker on _text_
# ============================================================

# The _default configset already includes a `spellcheck` SearchComponent
# bound to field `_text_` via DirectSolrSpellChecker, but it ships with
# thresholdTokenFrequency=0.01 — a candidate term must appear in >=1% of
# docs to be suggested. For a small reference DB that filters out exactly
# the long-tail suggestions we want (e.g. "trilobite" with 31 docs in a
# multi-thousand-doc corpus is well under 1%), so we override the
# component to set it to 0. See issue #35.
echo "Overriding spellcheck thresholdTokenFrequency..."
curl -sf -X POST -H 'Content-type:application/json' \
  "$SOLR_URL/solr/rad/config" -d '{
  "update-searchcomponent": {
    "name": "spellcheck",
    "class": "solr.SpellCheckComponent",
    "spellchecker": {
      "name": "default",
      "field": "_text_",
      "classname": "solr.DirectSolrSpellChecker",
      "distanceMeasure": "internal",
      "accuracy": 0.5,
      "maxEdits": 2,
      "minPrefix": 1,
      "maxInspections": 5,
      "minQueryLength": 4,
      "maxQueryFrequency": 0.01,
      "thresholdTokenFrequency": 0
    }
  }
}' > /dev/null
echo "  OK"

echo "Adding /refs request handler with spellcheck..."
curl -sf -X POST -H 'Content-type:application/json' \
  "$SOLR_URL/solr/rad/config" -d '{
  "add-requesthandler": {
    "name": "/refs",
    "class": "solr.SearchHandler",
    "defaults": {
      "defType": "edismax",
      "echoParams": "explicit",
      "rows": 10,
      "wt": "json",
      "df": "_text_",
      "boost": "recip(sub(2029, year),0.3,1,1)",
      "spellcheck": true,
      "spellcheck.dictionary": "default",
      "spellcheck.alternativeTermCount": 5,
      "spellcheck.count": 10
    },
    "last-components": ["spellcheck"]
  }
}' > /dev/null
echo "  OK"

# ============================================================
# 4. SOURCE core schema
#
# Fields:
#   id        - string UUID (generated by routes/sources.js via crypto.randomUUID())
#   name      - text, searchable (primary identifier for sources)
#   address   - string
#   city      - string
#   state     - string
#   zip       - string
#   telephone - string
#   fax       - string
#   email     - string
#   website   - string
#   _text_    - catch-all for default search
#
# The name field uses text_general to support phrase queries
# ("Journal Name") and prefix queries (name:Jour*) used by
# the autocomplete feature.
# ============================================================

echo ""
echo "--- Configuring 'source' core schema ---"

# Remove the default wildcard copy field — see note on the rad core above.
echo "Removing wildcard copy field (no-op if not present)..."
curl -s -X POST -H 'Content-type:application/json' \
  "$SOLR_URL/solr/source/schema" -d '{
  "delete-copy-field": { "source": "*", "dest": "_text_" }
}' > /dev/null
echo "  OK"

echo "Adding source fields and copy fields..."
curl -sf -X POST -H 'Content-type:application/json' \
  "$SOLR_URL/solr/source/schema" -d '{
  "add-field": [
    { "name": "name",      "type": "text_general", "stored": true, "indexed": true, "multiValued": false, "required": true },
    { "name": "address",   "type": "string",       "stored": true, "indexed": true, "multiValued": false },
    { "name": "city",      "type": "string",       "stored": true, "indexed": true, "multiValued": false },
    { "name": "state",     "type": "string",       "stored": true, "indexed": true, "multiValued": false },
    { "name": "zip",       "type": "string",       "stored": true, "indexed": true, "multiValued": false },
    { "name": "telephone", "type": "string",       "stored": true, "indexed": true, "multiValued": false },
    { "name": "fax",       "type": "string",       "stored": true, "indexed": true, "multiValued": false },
    { "name": "email",     "type": "string",       "stored": true, "indexed": true, "multiValued": false },
    { "name": "website",   "type": "string",       "stored": true, "indexed": true, "multiValued": false }
  ],
  "add-copy-field": [
    { "source": "name",    "dest": "_text_" },
    { "source": "address", "dest": "_text_" },
    { "source": "city",    "dest": "_text_" },
    { "source": "state",   "dest": "_text_" }
  ]
}' > /dev/null
echo "  OK"

# ============================================================
# 5. SOURCE core default query field
#
# Set the default search field to _text_ so unqualified queries
# on /solr/source/select work without specifying df.
# ============================================================

echo "Setting default query field for source core..."
curl -sf -X POST -H 'Content-type:application/json' \
  "$SOLR_URL/solr/source/config" -d '{
  "update-requesthandler": {
    "name": "/select",
    "class": "solr.SearchHandler",
    "defaults": {
      "df": "_text_",
      "echoParams": "explicit",
      "rows": 10,
      "wt": "json"
    }
  }
}' > /dev/null
echo "  OK"

echo ""
echo "=== Setup complete ==="
echo ""
echo "Cores created: rad, source"
echo "Next steps:"
echo "  - Import existing data if migrating from a previous Solr instance"
echo "  - Set SOLRPORT in .env to match your Solr port (default 8983)"
echo "  - Start the application with 'npm start'"
