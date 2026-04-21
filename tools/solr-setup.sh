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

echo "=== rad-admin Solr Setup ==="
echo "Solr URL: $SOLR_URL"
echo ""

# ============================================================
# 1. Create cores using a copy of the _default configset
# ============================================================

echo "--- Creating cores ---"

echo "Creating 'rad' core..."
curl -sf "$SOLR_URL/solr/admin/cores?action=CREATE&name=rad" > /dev/null
echo "  OK"

echo "Creating 'source' core..."
curl -sf "$SOLR_URL/solr/admin/cores?action=CREATE&name=source" > /dev/null
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

# Remove the default wildcard copy field so we control what is searchable
# Note: solr reports that this field is not present by default, but we include this step in case it exists to ensure only relevant fields are copied to _text_.
echo "Removing wildcard copy field..."
curl -sf -X POST -H 'Content-type:application/json' \
  "$SOLR_URL/solr/rad/schema" -d '{
  "delete-copy-field": { "source": "*", "dest": "_text_" }
}' > /dev/null
echo "  OK"

echo "Adding reference fields and copy fields..."
curl -sf -X POST -H 'Content-type:application/json' \
  "$SOLR_URL/solr/rad/schema" -d '{
  "add-field": [
    { "name": "author",    "type": "text_general", "stored": true, "indexed": true, "multiValued": false },
    { "name": "title",     "type": "text_general", "stored": true, "indexed": true, "multiValued": false },
    { "name": "dt",        "type": "string",       "stored": true, "indexed": true, "multiValued": false },
    { "name": "year",      "type": "pint",         "stored": true, "indexed": true, "multiValued": false },
    { "name": "reference", "type": "text_general", "stored": true, "indexed": true, "multiValued": false },
    { "name": "source",    "type": "string",       "stored": true, "indexed": true, "multiValued": false },
    { "name": "publisher", "type": "string",       "stored": true, "indexed": true, "multiValued": false },
    { "name": "page",      "type": "string",       "stored": true, "indexed": true, "multiValued": false },
    { "name": "abstract",  "type": "text_general", "stored": true, "indexed": true, "multiValued": false }
  ],
  "add-copy-field": [
    { "source": "author",    "dest": "_text_" },
    { "source": "title",     "dest": "_text_" },
    { "source": "reference", "dest": "_text_" },
    { "source": "source",    "dest": "_text_" },
    { "source": "abstract",  "dest": "_text_" },
    { "source": "page",      "dest": "_text_" }
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

echo "Adding /refs request handler with spellcheck..."
curl -sf -X POST -H 'Content-type:application/json' \
  "$SOLR_URL/solr/rad/config" -d '{
  "modify-searchcomponent": {
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
      "thresholdTokenFrequency": 0.01
    }
  },
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
#   id        - string UUID (auto-generated by Solr)
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

# Remove the default wildcard copy field\
# Note: solr reports that this field is not present by default, but we include this step in case it exists to ensure only relevant fields are copied to _text_.
echo "Removing wildcard copy field..."
curl -sf -X POST -H 'Content-type:application/json' \
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
# 5. SOURCE core UUID auto-generation
#
# Sources are created without an ID (POST /sources/new sends no id).
# Solr must auto-generate a UUID for new documents.
# ============================================================

echo "Configuring UUID auto-generation for source documents..."
curl -sf -X POST -H 'Content-type:application/json' \
  "$SOLR_URL/solr/source/config" -d '{
  "add-updateprocessor": {
    "name": "uuid-processor",
    "class": "solr.UUIDUpdateProcessorFactory",
    "fieldName": "id"
  },
  "add-updateprocessorchain": {
    "name": "uuid-chain",
    "processor": [
      "uuid-processor",
      "log",
      "run"
    ]
  },
  "update-requesthandler": {
    "name": "/update",
    "class": "solr.UpdateRequestHandler",
    "update.chain": "uuid-chain"
  }
}' > /dev/null
echo "  OK"

# ============================================================
# 6. SOURCE core default query field
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
