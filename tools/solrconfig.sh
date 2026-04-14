curl -X POST -H 'Content-type:application/json' -d '{
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
  },
  "add-searchcomponent": {
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
  }
}' http://localhost:8983/solr/rad/config
