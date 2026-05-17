// Citation formatting for the saved-references aggregator (#93) and the
// per-result citation modal. One source of truth so a tweak to a style only
// needs editing in one place.
//
// Public API:
//   window.RAD.citations.styles      — picker list (id + label per style)
//   window.RAD.citations.format(id, ref [, sourceData])
//                                    — returns an HTML string for the given style
//
// `ref` is the flat shape produced by unpackRef() in index.js plus a `type`
// field. `sourceData` is optional and supplied when the modal has fetched
// the source record (#144: lookup-on-modal-open for book/website citations).
//
// Pipeline (issue #144):
//   1. inferType        → derives 'book' / 'review' / 'journal' / 'proceedings'
//                         / 'periodical' / 'website' from type + reference shape.
//   2. parseAuthors     → splits on " and " / ", " (initial-aware) and runs
//                         humanparser on each part. Empty input → "Unknown".
//   3. parseVolumeIssue → pulls Vol/No/Issue numbers (incl. roman numerals
//                         and the combined "Vol N(M)" shape) out of the
//                         reference and returns a cleaned reference.
//   4. stripParentheticals → removes (paper), (perspective), etc. AFTER vol
//                            extraction so "Vol 3(2)" doesn't lose its issue.
//   5. stripPagePrefix  → strips leading p./pp./p so MLA can re-add it.
//   6. buildCiteModel   → assembles a normalized object the formatters consume.
//
// The formatters take the cite model and use joinNonEmpty() to skip empty
// segments (no more trailing ":" when page is blank). Escaping is done at
// output time by the helpers — the model itself holds raw strings so the
// regex helpers can see un-escaped text.

(function (root) {
    "use strict";

    // ============================================================
    // Helpers — input shape
    // ============================================================

    // ko.unwrap lets us accept either a Knockout observable (modal binds to
    // a RefViewModel) or a plain value (aggregator stores flat objects).
    function read(v) {
        if (v === undefined || v === null) return '';
        if (root.ko && root.ko.unwrap) v = root.ko.unwrap(v);
        return v == null ? '' : String(v);
    }

    function unpack(ref) {
        if (!ref) return {};
        return {
            author:     read(ref.author),
            title:      read(ref.title),
            reference:  read(ref.reference),
            page:       read(ref.page),
            source:     read(ref.source),
            publisher:  read(ref.publisher),
            date:       read(ref.date),
            year:       read(ref.year),
            type:       read(ref.type),
            rev_author: read(ref.rev_author),
            rev_title:  read(ref.rev_title),
            rev_date:   read(ref.rev_date),
            rev_source: read(ref.rev_source)
        };
    }

    // ============================================================
    // Helpers — output
    // ============================================================

    function escape(s) {
        if (s === undefined || s === null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Joins non-empty parts with the given separator. Empty strings, null,
    // and undefined drop out so a missing field doesn't leave punctuation.
    function joinNonEmpty(parts, sep) {
        return parts.filter(function (p) {
            return p !== undefined && p !== null && String(p).length > 0;
        }).join(sep);
    }

    // Like joinNonEmpty(parts, '. ') + '.' but strips trailing periods off
    // each segment first so "Smith, J." + ". " + "Title" doesn't produce
    // "Smith, J.. Title". Used by every "Author. Year. Title." style.
    function joinSentences(parts) {
        var nonEmpty = parts.filter(function (p) {
            return p !== undefined && p !== null && String(p).length > 0;
        }).map(function (p) { return String(p).replace(/\.+\s*$/, ''); });
        if (!nonEmpty.length) return '';
        var result = nonEmpty.join('. ') + '.';
        // `quote()` produces `&quot;Title.&quot;` — the segment is already
        // self-terminated, but the trailing-period strip above can't see
        // past the closing `&quot;` to drop the inner period, so the join
        // adds a second one and we end up with `&quot;.&quot;. `. Collapse
        // those down so MLA/Chicago don't double-punctuate the title.
        return result.replace(/(\.&quot;)\.(\s|$)/g, '$1$2');
    }

    function italic(s) {
        s = escape(s);
        return s ? '<i>' + s + '</i>' : '';
    }

    function quote(s) {
        s = escape(s);
        return s ? '&quot;' + s + '.&quot;' : '';
    }

    // ============================================================
    // Type inference (#144 step 1)
    // ============================================================

    // Periodical detector: anything that looks like Vol/Volume, No/Number,
    // Issue, or # followed by a number (arabic or roman). Loose on purpose
    // — refs that mention "volume" in passing are rare and being a touch
    // generous here costs nothing since the actual extraction is stricter.
    // `\b` doesn't anchor before `#` (both space and `#` are non-word), so use
    // (^|\s) for the # branch. (Test: 'CRSQ #2' should classify as periodical.)
    var PERIODICAL_HINT = /\b(vol|volume|no|number|issue|iss)\b\.?\s*[ivxlcdm0-9]|(^|\s)#\s*\d/i;

    // Reference body that indicates the work is conference proceedings.
    var PROCEEDINGS_HINT = /\b(conference|proceedings|symposium)\b/i;

    function inferType(ref) {
        var t = (ref.type || '').toLowerCase();
        if (t === 'book') return 'book';
        if (t === 'review') return 'review';
        // Reviews with rev_* populated but type left blank still count as reviews.
        if (ref.rev_title || ref.rev_author || ref.rev_source) return 'review';

        var hasPeriodicalShape = PERIODICAL_HINT.test(ref.reference || '');
        if (hasPeriodicalShape) {
            if (PROCEEDINGS_HINT.test(ref.reference || '')) return 'proceedings';
            if (t === 'technical') return 'journal';
            return 'periodical';
        }
        return 'website';
    }

    // ============================================================
    // Roman numeral conversion (#144 step 2 — roman issue numbers)
    // ============================================================

    var ROMAN_RE = /^[IVXLCDM]+$/i;
    var ROMAN_MAP = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

    function romanToArabic(s) {
        if (!s || !ROMAN_RE.test(s)) return null;
        var lower = s.toLowerCase();
        var total = 0;
        for (var i = 0; i < lower.length; i++) {
            var cur = ROMAN_MAP[lower[i]];
            var next = ROMAN_MAP[lower[i + 1]];
            total += (next && next > cur) ? -cur : cur;
        }
        return String(total);
    }

    function normalizeNum(raw) {
        if (!raw) return null;
        raw = String(raw).trim();
        if (/^\d+$/.test(raw)) return raw;
        var arabic = romanToArabic(raw);
        return arabic || raw;
    }

    // ============================================================
    // Volume / issue extraction (#144 step 2)
    // ============================================================

    // Matches "Vol. 3(2)" / "Volume 3 (2)" — the combined shape — first, so
    // both numbers are captured in one pass. The number tokens are
    // \d+|[ivxlcdm]+ so roman numerals work.
    var VOL_ISSUE_COMBO = /\b(?:vol(?:ume)?|v)\.?\s*(\d+|[ivxlcdm]+)\s*\(\s*(\d+|[ivxlcdm]+)\s*\)/i;

    // Standalone volume / issue patterns. Order matters: longer prefixes
    // (Volume, Number, Issue) before shorter (Vol, No, #) so "Volume" isn't
    // consumed as "Vol" + "ume".
    var VOL_RE = /\b(?:vol(?:ume)?|v)\.?\s*(\d+|[ivxlcdm]+)\b/i;
    var ISSUE_RE = /\b(?:no|number|iss(?:ue)?|n)\.?\s*(\d+|[ivxlcdm]+)\b/i;
    var HASH_ISSUE_RE = /#\s*(\d+|[ivxlcdm]+)\b/;

    function parseVolumeIssue(reference) {
        var result = { volume: null, issue: null, cleanedReference: reference || '' };
        if (!reference) return result;

        var combo = reference.match(VOL_ISSUE_COMBO);
        if (combo) {
            result.volume = normalizeNum(combo[1]);
            result.issue = normalizeNum(combo[2]);
            result.cleanedReference = reference.replace(VOL_ISSUE_COMBO, '').trim();
        } else {
            var vol = reference.match(VOL_RE);
            if (vol) {
                result.volume = normalizeNum(vol[1]);
                result.cleanedReference = result.cleanedReference.replace(VOL_RE, '').trim();
            }
            var iss = result.cleanedReference.match(ISSUE_RE) || result.cleanedReference.match(HASH_ISSUE_RE);
            if (iss) {
                result.issue = normalizeNum(iss[1]);
                result.cleanedReference = result.cleanedReference
                    .replace(ISSUE_RE, '')
                    .replace(HASH_ISSUE_RE, '')
                    .trim();
            }
        }

        // Clean up stray punctuation left behind by the removals.
        result.cleanedReference = result.cleanedReference
            .replace(/\s+,/g, ',')
            .replace(/,\s*,/g, ',')
            .replace(/^[,\s]+|[,\s]+$/g, '')
            .replace(/\s{2,}/g, ' ');
        return result;
    }

    // ============================================================
    // Parenthetical removal (#144 step 3)
    // ============================================================

    // Remove (paper), (perspective), (peer-reviewed), etc. Runs AFTER vol
    // extraction since refs like "Vol. 3 (2)" depend on the parentheses.
    function stripParentheticals(s) {
        if (!s) return '';
        return s
            .replace(/\s*\([^()]*\)\s*/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .replace(/^[,\s]+|[,\s]+$/g, '');
    }

    // ============================================================
    // Page prefix stripping (#144 — leading p./pp.)
    // ============================================================

    var PAGE_PREFIX_RE = /^\s*p{1,2}\.?\s*/i;
    function stripPagePrefix(page) {
        if (!page) return '';
        return String(page).replace(PAGE_PREFIX_RE, '').trim();
    }

    // ============================================================
    // Author parsing (#144 — humanparser-backed)
    // ============================================================

    // Splits a multi-author string into individual names. The naive
    // `split(',')` mangles "Smith, J. M." (treats it as two authors), so
    // first strip parentheticals (so "(ed.)" doesn't get split), then split
    // on " and " / " & " (between names), and finally split each chunk on
    // comma boundaries that look like author separators rather than the
    // "Last, First" inversion.
    function splitAuthors(s) {
        if (!s) return [];
        // Drop (ed.), (eds.), (trans.), etc. before splitting.
        var cleaned = s.replace(/\([^()]*\)/g, '').replace(/\s{2,}/g, ' ').trim();
        if (!cleaned) return [];

        // Split on " and " or " & " first.
        var byAnd = cleaned.split(/\s+(?:and|&)\s+/i);

        var out = [];
        byAnd.forEach(function (chunk) {
            chunk = chunk.trim();
            if (!chunk) return;
            // Heuristic: in an academic ref, individual authors are
            // separated by ", " AND followed by a token containing only
            // initials/capitals before the next comma. The simplest cut:
            // if the chunk has 2+ commas, treat every other comma starting
            // from the second as a separator. Practically: split on ", "
            // and re-pair Last-with-Initials when the next part starts
            // with an initial (single capital + dot).
            var parts = chunk.split(/,\s+/);
            var i = 0;
            while (i < parts.length) {
                var head = parts[i];
                var next = parts[i + 1];
                if (next && /^([A-Z]\.\s*){1,4}([A-Z][a-z\-']*)?$/.test(next)) {
                    out.push(head + ', ' + next);
                    i += 2;
                } else {
                    out.push(head);
                    i += 1;
                }
            }
        });

        // Strip stray leading/trailing commas and semicolons that the split
        // can leave behind (e.g. "A, B, and C" → first chunk is "A, B,").
        // Without this, humanparser sees the comma and mis-classifies the
        // piece as last-name-first format, dropping the first name. (#144)
        return out.map(function (n) {
            return n.replace(/^[,;\s]+|[,;\s]+$/g, '');
        }).filter(Boolean);
    }

    function getHumanparser() {
        if (root.RAD && root.RAD.humanparser) return root.RAD.humanparser;
        if (typeof require === 'function') {
            try { return require('./humanparser'); } catch (_) { /* fall through */ }
        }
        return null;
    }

    function initialsFrom(parsed) {
        // humanparser gives us firstName, middleName as full tokens. Reduce
        // each to its leading letter + "." so "James M." → "J. M.".
        function toInitials(s) {
            if (!s) return '';
            return s.split(/\s+/).map(function (tok) {
                var letter = tok.replace(/[^A-Za-z]/g, '').charAt(0);
                return letter ? letter.toUpperCase() + '.' : '';
            }).filter(Boolean).join(' ');
        }
        return joinNonEmpty([toInitials(parsed.firstName), toInitials(parsed.middleName)], ' ');
    }

    function parseAuthors(authorString) {
        var unknown = [{ last: 'Unknown', initials: '', full: 'Unknown' }];
        if (!authorString) return unknown;

        var hp = getHumanparser();
        var pieces = splitAuthors(authorString);
        if (!pieces.length) return unknown;

        var authors = pieces.map(function (piece) {
            if (!hp) {
                // No library available — best-effort fall back.
                return { last: piece, initials: '', full: piece };
            }
            var parsed = hp.parseName(piece) || {};
            var last = parsed.lastName || '';
            var initials = initialsFrom(parsed);
            var full = parsed.fullName || piece;
            if (!last && !initials) {
                return { last: piece, initials: '', full: piece };
            }
            return { last: last, initials: initials, full: full };
        }).filter(function (a) { return a.last || a.initials || a.full; });

        return authors.length ? authors : unknown;
    }

    // ============================================================
    // Cite model builder
    // ============================================================

    function buildCiteModel(rawRef, sourceData) {
        var ref = unpack(rawRef);
        var citationType = inferType(ref);

        var vi = parseVolumeIssue(ref.reference);
        var cleanedRef = stripParentheticals(vi.cleanedReference);

        var authors = parseAuthors(ref.author);
        var page = stripPagePrefix(ref.page);

        var model = {
            citationType: citationType,
            authors: authors,
            authorsRaw: ref.author,
            title: ref.title,
            year: ref.year,
            date: ref.date,
            reference: cleanedRef,
            referenceRaw: ref.reference,
            volume: vi.volume,
            issue: vi.issue,
            page: page,
            publisher: ref.publisher,
            source: ref.source,
            rev_author: ref.rev_author,
            rev_title: ref.rev_title,
            rev_date: ref.rev_date,
            rev_source: ref.rev_source,
            // Source-core enrichment (#144 — populated by generateCitation
            // when it fetches the source record on modal open).
            publisherName: '',
            publisherCity: '',
            publisherState: '',
            website: ''
        };

        if (sourceData) {
            // Source fields are single-valued strings in Solr, but a legacy
            // multi-valued schema would hand back arrays — guard for both.
            function first(v) { return Array.isArray(v) ? v[0] : v; }
            model.publisherName = read(first(sourceData.name)) || model.publisher;
            model.publisherCity = read(first(sourceData.city));
            model.publisherState = read(first(sourceData.state));
            model.website = read(first(sourceData.website));
        } else {
            model.publisherName = model.publisher;
        }

        return model;
    }

    // ============================================================
    // Formatter building blocks
    // ============================================================

    // "Smith, J. M., R. T. Jones, and K. Brown" — the comma-inverted form
    // used by most academic styles in this corpus. Single-author refs lose
    // the trailing "and"; an unknown author renders as "Unknown".
    //
    // opts.tightInitials: when true, collapse the inter-initial space so
    // "J. M." renders as "J.M." for styles that prefer the tight form.
    function formatAuthorsList(authors, opts) {
        if (!authors || !authors.length) return '';
        opts = opts || {};
        function fmtInitials(s) {
            if (!s) return '';
            return opts.tightInitials ? s.replace(/\.\s+(?=[A-Z]\.)/g, '.') : s;
        }
        var parts = authors.map(function (a, i) {
            if (a.last === 'Unknown' && !a.initials) return 'Unknown';
            var initials = fmtInitials(a.initials);
            // First author inverted: "Smith, J. M."
            // Subsequent authors natural: "J. M. Smith"
            if (i === 0) {
                return joinNonEmpty([a.last + (initials ? ',' : ''), initials], ' ');
            }
            return joinNonEmpty([initials, a.last], ' ') || a.full;
        });
        if (parts.length === 1) return parts[0];
        if (parts.length === 2) return parts[0] + ' and ' + parts[1];
        return parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
    }

    // Renders the periodical "Reference vol(issue)" tail, omitting absent pieces.
    function volumeIssueSuffix(model) {
        if (!model.volume && !model.issue) return '';
        if (model.volume && model.issue) return model.volume + '(' + model.issue + ')';
        return model.volume || model.issue;
    }

    // Renders the periodical "Reference vol(issue)" tail, omitting absent pieces.
    function volumeIssueSeparated(model, opts) {
        opts = opts || {};
        if (!model.volume && !model.issue) return '';
        var volTag = opts.volTag || '';
        var issueTag = opts.issueTag || 'no. ';
        var issueSep = opts.issueSep || ', ';
        if (model.volume && model.issue) return volTag + model.volume + issueSep + issueTag + model.issue;
        return volTag + model.volume || issueTag + model.issue;
    }

    // Periodical reference body: italic reference, optional vol(issue), optional :page.
    function periodicalBody(model, opts) {
        opts = opts || {};
        var refItalic = italic(model.reference);
        var vi = opts.issueFormat ? volumeIssueSeparated(model, opts.issueFormat) : volumeIssueSuffix(model);
        var head = joinNonEmpty([refItalic, vi ? escape(vi) : ''], ' ');
        var page = model.page ? escape(model.page) : '';
        if (!head) return page ? (opts.pagePrefix || '') + page : '';
        if (!page) return head;
        var sep = opts.pageSep != null ? opts.pageSep : ':';
        return head + sep + page;
    }

    function bookPublisher(model) {
        var name = model.publisherName || model.publisher;
        var loc = joinNonEmpty([model.publisherCity, model.publisherState], ', ');
        // "City, ST: Publisher" — standard book citation order.
        return joinNonEmpty([escape(loc), escape(name)], ': ');
    }

    function websiteTail(model) {
        var url = model.website || model.publisher;
        return escape(url);
    }

    function reviewTitle(model) {
        // "Review of: <title>" — wraps the rev_title (the work being
        // reviewed) so the review's own reference and page still flow into
        // the periodical body section.
        var rt = escape(model.rev_title);
        if (!rt) return '';
        var byline = joinNonEmpty([
            escape(model.rev_author),
            escape(model.rev_date)
        ], ', ');
        var inner = byline ? rt + ' (' + byline + ')' : rt;
        return 'Review of: ' + inner;
    }

    // ============================================================
    // Formatters — one per style, branching on citationType
    // ============================================================

    function crsq(model) {
        var authors = formatAuthorsList(model.authors, { tightInitials: true });
        var year = escape(model.year);
        var title = escape(model.title);

        if (model.citationType === 'book') {
            return joinSentences([authors, year, italic(title), bookPublisher(model)]);
        }
        if (model.citationType === 'website') {
            return joinSentences([authors, year, title, 'Retrieved from ' + websiteTail(model)]);
        }
        if (model.citationType === 'review') {
            return joinSentences([authors, year, reviewTitle(model), periodicalBody(model, {issueFormat: {volTag: ''} })]);
        }
        if (model.citationType === 'proceedings') {
            return joinSentences([authors, year, title, 'In ' + periodicalBody(model, { pagePrefix: ', pp. ', issueFormat: { volTag: 'Vol. ' } })]);
        }

        // periodical / journal
        return joinSentences([authors, year, title, periodicalBody(model, {issueFormat: {volTag: ''} })]);
    }

    function arj(model) {
        var authors = formatAuthorsList(model.authors);
        var year = escape(model.year);
        var titleQ = quote(model.title);

        if (model.citationType === 'book') {
            return joinSentences([authors, year, italic(title), bookPublisher(model)]);
        }
        if (model.citationType === 'website') {
            return joinSentences([authors, year, titleQ, websiteTail(model)]);
        }
        if (model.citationType === 'review') {
            return joinSentences([authors, year, reviewTitle(model), periodicalBody(model, {issueFormat: {volTag: ''} })].filter(function (s) { return s !== '.'; }));
        }
        return joinSentences([authors, year, titleQ, periodicalBody(model, {issueFormat: {volTag: ''} })].filter(function (s) { return s && s !== '.'; }));
    }

    function joc(model) {
        var authors = formatAuthorsList(model.authors);
        var title = escape(model.title);
        var year = escape(model.year);

        if (model.citationType === 'book') {
            return joinNonEmpty([authors, title, bookPublisher(model), year], ', ') + '.';
        }
        if (model.citationType === 'website') {
            return joinNonEmpty([authors, title, websiteTail(model), year], ', ') + '.';
        }
        if (model.citationType === 'review') {
            return joinNonEmpty([authors, reviewTitle(model), periodicalBody(model), year], ', ') + '.';
        }
        return joinNonEmpty([authors, title, periodicalBody(model), year], ', ') + '.';
    }

    function mla(model) {
        var authors = formatAuthorsList(model.authors);
        var titleQ = quote(model.title);
        var year = escape(model.year);

        // MLA wants "p./pp." in front of page numbers (the prefix we stripped
        // out of the raw page field earlier so it isn't double-printed).
        function withPageMarker() {
            return periodicalBody(model, { pageSep: ', ', pagePrefix: '' })
                .replace(/, (\S+)$/, function (_, p) { return ', pp. ' + p; });
        }

        if (model.citationType === 'book') {
            return joinSentences([authors, titleQ, bookPublisher(model), year]);
        }
        if (model.citationType === 'website') {
            return joinSentences([authors, titleQ, websiteTail(model), year]);
        }
        if (model.citationType === 'review') {
            return joinSentences([authors, reviewTitle(model), withPageMarker(), year]);
        }
        return joinSentences([authors, titleQ, withPageMarker(), year]);
    }

    function apa(model) {
        var authors = formatAuthorsList(model.authors);
        var year = escape(model.year);
        var yearParen = year ? '(' + year + ')' : '';
        var title = escape(model.title);

        if (model.citationType === 'book') {
            return joinSentences([authors, yearParen, title, bookPublisher(model)]);
        }
        if (model.citationType === 'website') {
            return joinSentences([authors, yearParen, title, websiteTail(model)]);
        }
        if (model.citationType === 'review') {
            return joinSentences([authors, yearParen, reviewTitle(model), periodicalBody(model, { pageSep: ', ' })]);
        }
        return joinSentences([authors, yearParen, title, periodicalBody(model, { pageSep: ', ' })]);
    }

    function chicago(model) {
        var authors = formatAuthorsList(model.authors);
        var titleQ = quote(model.title);
        var year = escape(model.year);
        var yearParen = year ? '(' + year + ')' : '';

        if (model.citationType === 'book') {
            return joinSentences([authors, titleQ, bookPublisher(model), yearParen]);
        }
        if (model.citationType === 'website') {
            return joinSentences([authors, titleQ, websiteTail(model), yearParen]);
        }
        if (model.citationType === 'review') {
            return joinSentences([authors, reviewTitle(model), periodicalBody(model, { pageSep: ': ' }), yearParen]);
        }
        // Chicago periodical: Author. "Title." Reference vol(issue) (Year): Page.
        var body = periodicalBody(model, { pageSep: ': ' });
        if (yearParen && body) {
            // Insert year before the page colon: "Reference vol(issue) (Year): Page"
            body = body.replace(/^(.*?)(: \S+)$/, '$1 ' + yearParen + '$2');
            if (!/[(]\d/.test(body)) body = body + ' ' + yearParen;
        } else if (yearParen) {
            body = yearParen;
        }
        return joinSentences([authors, titleQ, body]);
    }

    var formatters = {
        crsq: crsq,
        arj: arj,
        joc: joc,
        mla: mla,
        apa: apa,
        chicago: chicago
    };

    // ============================================================
    // Public surface
    // ============================================================

    var api = {
        // Ordered for picker display; preserves the modal's historical order.
        styles: [
            { id: 'crsq',    label: 'CRSQ/ICC' },
            { id: 'arj',     label: 'ARJ' },
            { id: 'joc',     label: 'JoC' },
            { id: 'mla',     label: 'MLA' },
            { id: 'apa',     label: 'APA' },
            { id: 'chicago', label: 'Chicago' }
        ],
        format: function (styleId, ref, sourceData) {
            var fn = formatters[styleId];
            if (!fn) return '';
            var model = buildCiteModel(ref, sourceData);
            return fn(model);
        },
        // Internals exposed for unit tests only.
        _internals: {
            inferType: function (ref) { return inferType(unpack(ref)); },
            parseVolumeIssue: parseVolumeIssue,
            stripParentheticals: stripParentheticals,
            stripPagePrefix: stripPagePrefix,
            parseAuthors: parseAuthors,
            splitAuthors: splitAuthors,
            joinNonEmpty: joinNonEmpty,
            romanToArabic: romanToArabic,
            buildCiteModel: buildCiteModel,
            formatAuthorsList: formatAuthorsList
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.RAD = root.RAD || {};
        root.RAD.citations = api;
    }
}(typeof window !== 'undefined' ? window : globalThis));
