var express = require('express');
var router = express.Router();
var log4js = require('log4js');
var auditLogger = log4js.getLogger("audit");
var Campaign = require('../models/campaign');
var fieldDescriptions = require('../config/fieldDescriptions');

// Render the campaigns admin page with the full list pre-loaded. The grid is
// small (campaign count is in the dozens, not thousands) so we don't paginate.
router.get('/', async function (req, res, next) {
    try {
        var collection = await Campaign.query();
        var campaigns = collection.map(function (m) {
            return {
                id: m.id,
                name: m.name,
                description: m.description,
                refs: m.refs || []
            };
        });
        res.render('campaigns', Object.assign({}, req.replacements, {
            campaigns: campaigns,
            fieldDocs: fieldDescriptions.campaigns,
            cmpActive: 1
        }));
    } catch (err) {
        next(err);
    }
});

// Lightweight JSON listing for the picker modal on /refs. We don't return the
// full refs array — just enough for the user to choose a campaign. Ordered by
// updated_at desc so the campaign the user just touched (added refs, renamed,
// etc.) surfaces at the top (#165). The column is MySQL-managed via
// ON UPDATE CURRENT_TIMESTAMP — see migration.js — so any UPDATE bumps it
// without app-side bookkeeping. id desc breaks ties (notably the migration-
// time tie for rows that existed before the column was added).
router.get('/list.json', async function (req, res, next) {
    try {
        var collection = await Campaign.query()
            .orderBy('updated_at', 'desc')
            .orderBy('id', 'desc');
        var list = collection.map(function (m) {
            var refs = m.refs || [];
            return { id: m.id, name: m.name, refCount: refs.length };
        });
        res.json(list);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Could not load campaign list.' });
    }
});

router.post('/new', async function (req, res, next) {
    var name = (req.body.name || '').trim();
    if (!name) {
        res.status(400).json({ error: 'Campaign name is required.' });
        return;
    }

    try {
        // updated_at is auto-populated by MySQL's DEFAULT CURRENT_TIMESTAMP
        // on insert, so a freshly-created campaign naturally sorts to the
        // top of the picker (#165).
        var saved = await Campaign.query().insertAndFetch({
            name: name,
            description: req.body.description || '',
            refs: []
        });
        auditLogger.info(req.user.email + " created a new campaign: " + JSON.stringify({ id: saved.id, name: saved.name }));
        req.flash('yay', 'Campaign created.');
        // Return the saved id/name so callers that don't redirect (e.g. the
        // refs-page picker's inline create flow) can preselect the new entry.
        res.json({
            redirect: '/campaigns',
            campaign: { id: saved.id, name: saved.name, refCount: 0 }
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'A problem occurred saving the campaign.' });
    }
});

// Edits leave `refs` alone — only name and description are touched here. Ref
// membership is managed via /:id/refs endpoints below.
router.post('/:id(\\d+)', async function (req, res, next) {
    var name = (req.body.name || '').trim();
    if (!name) {
        res.status(400).json({ error: 'Campaign name is required.' });
        return;
    }

    try {
        var campaign = await Campaign.query().findById(req.params.id).throwIfNotFound();
        var oldName = campaign.name;
        var oldDescription = campaign.description;
        await campaign.$query().patch({ name: name, description: req.body.description || '' });
        auditLogger.info(req.user.email + " edited campaign " + req.params.id +
            ":\nOriginal: " + JSON.stringify({ name: oldName, description: oldDescription }) +
            "\nUpdated: " + JSON.stringify({ name: name, description: req.body.description || '' }));
        req.flash('yay', 'Campaign updated.');
        res.json({ redirect: '/campaigns' });
    } catch (err) {
        if (err instanceof Campaign.NotFoundError) {
            res.status(404).json({ error: 'Campaign not found.' });
            return;
        }
        console.log(err);
        res.status(500).json({ error: 'A problem occurred saving the campaign.' });
    }
});

// Soft-guard: refuse to delete a campaign that still has refs unless the
// caller passes ?force=1. The client uses the 409 response + refCount to
// surface a "really delete?" confirm dialog.
router.delete('/:id(\\d+)', async function (req, res, next) {
    if (req.user.permission < 1) {
        res.status(403).json({ error: 'Insufficient permission.' });
        return;
    }

    try {
        var campaign = await Campaign.query().findById(req.params.id).throwIfNotFound();
        var refs = campaign.refs || [];
        if (refs.length > 0 && req.query.force !== '1') {
            res.status(409).json({
                error: 'Campaign still has references attached.',
                refCount: refs.length
            });
            return;
        }

        var snapshot = { id: campaign.id, name: campaign.name, refCount: refs.length };
        await campaign.$query().delete();
        auditLogger.info(req.user.email + " deleted campaign: " + JSON.stringify(snapshot));
        req.flash('yay', 'Campaign deleted.');
        res.json({ redirect: '/campaigns' });
    } catch (err) {
        if (err instanceof Campaign.NotFoundError) {
            res.status(404).json({ error: 'Campaign not found.' });
            return;
        }
        console.log(err);
        res.status(500).json({ error: 'A problem occurred deleting the campaign.' });
    }
});

// Add ref IDs to a campaign. Body: {ids: [Number, ...]} or {id: Number}.
// De-duplicates against the existing array so calling this twice with the
// same payload is a no-op.
router.post('/:id(\\d+)/refs', async function (req, res, next) {
    var ids = [];
    if (Array.isArray(req.body.ids)) {
        ids = req.body.ids;
    } else if (req.body.id !== undefined) {
        ids = [req.body.id];
    }
    var numericIds = ids
        .map(function (n) { return parseInt(n, 10); })
        .filter(function (n) { return !isNaN(n); });
    if (numericIds.length === 0) {
        res.status(400).json({ error: 'No valid reference IDs provided.' });
        return;
    }

    try {
        var campaign = await Campaign.query().findById(req.params.id).throwIfNotFound();
        var existing = campaign.refs || [];
        var seen = {};
        existing.forEach(function (n) { seen[n] = true; });
        var added = [];
        numericIds.forEach(function (n) {
            if (!seen[n]) { seen[n] = true; existing.push(n); added.push(n); }
        });
        // Skip the patch entirely when every requested id was already in the
        // campaign. MySQL's ON UPDATE CURRENT_TIMESTAMP would otherwise bump
        // updated_at on a no-op write and shuffle the picker order for what
        // is effectively a duplicate request (#165). The audit log is also
        // skipped — nothing was actually added.
        if (added.length === 0) {
            res.json({ added: 0, refCount: existing.length });
            return;
        }
        await campaign.$query().patch({ refs: existing });
        auditLogger.info(req.user.email + " added refs to campaign " + req.params.id + ": " + JSON.stringify(added));
        res.json({ added: added.length, refCount: existing.length });
    } catch (err) {
        if (err instanceof Campaign.NotFoundError) {
            res.status(404).json({ error: 'Campaign not found.' });
            return;
        }
        console.log(err);
        res.status(500).json({ error: 'A problem occurred updating the campaign.' });
    }
});

router.delete('/:id(\\d+)/refs/:refId(\\d+)', async function (req, res, next) {
    var refId = parseInt(req.params.refId, 10);

    try {
        var campaign = await Campaign.query().findById(req.params.id).throwIfNotFound();
        var existing = campaign.refs || [];
        var filtered = existing.filter(function (n) { return n !== refId; });
        if (filtered.length === existing.length) {
            // Nothing to do; treat as success so the UI can move on.
            res.json({ removed: 0, refCount: existing.length });
            return;
        }
        await campaign.$query().patch({ refs: filtered });
        auditLogger.info(req.user.email + " removed ref " + refId + " from campaign " + req.params.id);
        res.json({ removed: 1, refCount: filtered.length });
    } catch (err) {
        if (err instanceof Campaign.NotFoundError) {
            res.status(404).json({ error: 'Campaign not found.' });
            return;
        }
        console.log(err);
        res.status(500).json({ error: 'A problem occurred updating the campaign.' });
    }
});

module.exports = router;
