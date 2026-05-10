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
        var collection = await Campaign.fetchAll();
        var campaigns = collection.models.map(function (m) {
            return {
                id: m.get('id'),
                name: m.get('name'),
                description: m.get('description'),
                refs: m.get('refs') || []
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
// full refs array — just enough for the user to choose a campaign.
router.get('/list.json', async function (req, res, next) {
    try {
        var collection = await Campaign.fetchAll();
        var list = collection.models.map(function (m) {
            var refs = m.get('refs') || [];
            return { id: m.get('id'), name: m.get('name'), refCount: refs.length };
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
        var saved = await new Campaign({
            name: name,
            description: req.body.description || '',
            refs: []
        }).save();
        auditLogger.info(req.user.get("email") + " created a new campaign: " + JSON.stringify({ id: saved.get('id'), name: saved.get('name') }));
        req.flash('yay', 'Campaign created.');
        // Return the saved id/name so callers that don't redirect (e.g. the
        // refs-page picker's inline create flow) can preselect the new entry.
        res.json({
            redirect: '/campaigns',
            campaign: { id: saved.get('id'), name: saved.get('name'), refCount: 0 }
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
        var campaign = await new Campaign({ id: req.params.id }).fetch();
        var oldName = campaign.get('name');
        var oldDescription = campaign.get('description');
        campaign.set({ name: name, description: req.body.description || '' });
        await campaign.save();
        auditLogger.info(req.user.get("email") + " edited campaign " + req.params.id +
            ":\nOriginal: " + JSON.stringify({ name: oldName, description: oldDescription }) +
            "\nUpdated: " + JSON.stringify({ name: name, description: req.body.description || '' }));
        req.flash('yay', 'Campaign updated.');
        res.json({ redirect: '/campaigns' });
    } catch (err) {
        if (err && err.message && /EmptyResponse/.test(err.message)) {
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
    if (req.user.get("permission") < 1) {
        res.status(403).json({ error: 'Insufficient permission.' });
        return;
    }

    try {
        var campaign = await new Campaign({ id: req.params.id }).fetch();
        var refs = campaign.get('refs') || [];
        if (refs.length > 0 && req.query.force !== '1') {
            res.status(409).json({
                error: 'Campaign still has references attached.',
                refCount: refs.length
            });
            return;
        }

        var snapshot = { id: campaign.get('id'), name: campaign.get('name'), refCount: refs.length };
        await campaign.destroy();
        auditLogger.info(req.user.get("email") + " deleted campaign: " + JSON.stringify(snapshot));
        req.flash('yay', 'Campaign deleted.');
        res.json({ redirect: '/campaigns' });
    } catch (err) {
        if (err && err.message && /EmptyResponse/.test(err.message)) {
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
        var campaign = await new Campaign({ id: req.params.id }).fetch();
        var existing = campaign.get('refs') || [];
        var seen = {};
        existing.forEach(function (n) { seen[n] = true; });
        var added = [];
        numericIds.forEach(function (n) {
            if (!seen[n]) { seen[n] = true; existing.push(n); added.push(n); }
        });
        campaign.set('refs', existing);
        await campaign.save();
        auditLogger.info(req.user.get("email") + " added refs to campaign " + req.params.id + ": " + JSON.stringify(added));
        res.json({ added: added.length, refCount: existing.length });
    } catch (err) {
        if (err && err.message && /EmptyResponse/.test(err.message)) {
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
        var campaign = await new Campaign({ id: req.params.id }).fetch();
        var existing = campaign.get('refs') || [];
        var filtered = existing.filter(function (n) { return n !== refId; });
        if (filtered.length === existing.length) {
            // Nothing to do; treat as success so the UI can move on.
            res.json({ removed: 0, refCount: existing.length });
            return;
        }
        campaign.set('refs', filtered);
        await campaign.save();
        auditLogger.info(req.user.get("email") + " removed ref " + refId + " from campaign " + req.params.id);
        res.json({ removed: 1, refCount: filtered.length });
    } catch (err) {
        if (err && err.message && /EmptyResponse/.test(err.message)) {
            res.status(404).json({ error: 'Campaign not found.' });
            return;
        }
        console.log(err);
        res.status(500).json({ error: 'A problem occurred updating the campaign.' });
    }
});

module.exports = router;
