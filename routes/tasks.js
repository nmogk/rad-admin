var express = require('express');
var router = express.Router();
var log4js = require('log4js');
var auditLogger = log4js.getLogger("audit");
var Periodical = require('../models/periodical');
var IssueTodo = require('../models/issue-todo');
var GeneralTodo = require('../models/general-todo');
var User = require('../models/user');
var refTypes = require('../config/refTypes');

var DATE_RGX = /^\d{4}(-\d{2}(-\d{2})?)?$/;
var validRefTypes = refTypes.map(function (t) { return t.value; });

function maxTime(a, b) {
    if (!a) return b;
    if (!b) return a;
    return new Date(a) > new Date(b) ? a : b;
}

function effectiveUpdatedAt(periodical) {
    var t = periodical.updated_at;
    (periodical.issues || []).forEach(function (i) { t = maxTime(t, i.updated_at); });
    return t;
}

function hasOutstanding(periodical) {
    return (periodical.issues || []).some(function (i) { return !i.completed; });
}

function userHasOutstanding(periodical, userId) {
    if (!userId) return false;
    return (periodical.issues || []).some(function (i) {
        return !i.completed && i.editor && i.editor.id === userId;
    });
}

function shapeIssue(i) {
    return {
        id: i.id,
        periodical_id: i.periodical_id,
        volume: i.volume,
        number: i.number,
        dt: i.dt,
        link: i.link,
        editor: i.editor ? { id: i.editor.id, name: i.editor.name || i.editor.email } : null,
        completed: !!i.completed,
        updated_at: i.updated_at
    };
}

function shapeGeneral(g) {
    return {
        id: g.id,
        description: g.description,
        dt: g.dt,
        link: g.link,
        editor: g.editor ? { id: g.editor.id, name: g.editor.name || g.editor.email } : null,
        completed: !!g.completed,
        updated_at: g.updated_at
    };
}

function shapePeriodical(p) {
    return {
        id: p.id,
        name: p.name,
        publisher_name: p.publisher_name,
        type: p.type || '',
        updated_at: p.updated_at,
        issues: (p.issues || []).map(shapeIssue)
    };
}

router.get('/', async function (req, res, next) {
    try {
        var uid = req.user.id;
        var periodicals = await Periodical.query().withGraphFetched('issues.[editor]');
        // Sort: user-assigned (with outstanding) → has-outstanding → effective updated_at
        periodicals.sort(function (a, b) {
            var aMine = userHasOutstanding(a, uid) ? 1 : 0;
            var bMine = userHasOutstanding(b, uid) ? 1 : 0;
            if (aMine !== bMine) return bMine - aMine;
            var aOut = hasOutstanding(a) ? 1 : 0;
            var bOut = hasOutstanding(b) ? 1 : 0;
            if (aOut !== bOut) return bOut - aOut;
            var aT = effectiveUpdatedAt(a);
            var bT = effectiveUpdatedAt(b);
            if (!aT && !bT) return 0;
            if (!aT) return 1;
            if (!bT) return -1;
            return new Date(bT) - new Date(aT);
        });
        var generals = await GeneralTodo.query().withGraphFetched('editor');
        // Sort: user-assigned-and-open → completed (incomplete first) → updated_at desc
        generals.sort(function (a, b) {
            var aMine = (!a.completed && a.editor && a.editor.id === uid) ? 1 : 0;
            var bMine = (!b.completed && b.editor && b.editor.id === uid) ? 1 : 0;
            if (aMine !== bMine) return bMine - aMine;
            var aDone = a.completed ? 1 : 0;
            var bDone = b.completed ? 1 : 0;
            if (aDone !== bDone) return aDone - bDone;
            if (!a.updated_at && !b.updated_at) return 0;
            if (!a.updated_at) return 1;
            if (!b.updated_at) return -1;
            return new Date(b.updated_at) - new Date(a.updated_at);
        });

        res.render('tasks', Object.assign({}, req.replacements, {
            periodicals: periodicals.map(shapePeriodical),
            generals: generals.map(shapeGeneral),
            currentUserId: uid,
            refTypes: refTypes,
            tskActive: 1
        }));
    } catch (err) {
        next(err);
    }
});

router.get('/users.json', async function (req, res) {
    if (req.user.permission < 1) {
        res.status(403).json({ error: 'Insufficient permission.' });
        return;
    }
    try {
        var users = await User.query().select('id', 'email', 'name').orderBy('name');
        res.json(users.map(function (u) { return { id: u.id, name: u.name || u.email }; }));
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Could not load user list.' });
    }
});

// ---------- Periodicals ----------

router.post('/periodicals/new', async function (req, res) {
    var name = (req.body.name || '').trim();
    var publisher = (req.body.publisher_name || '').trim();
    var type = (req.body.type || '').trim();
    if (!name) { res.status(400).json({ error: 'Periodical name is required.' }); return; }
    if (!publisher) { res.status(400).json({ error: 'Publisher name is required.' }); return; }
    if (type && validRefTypes.indexOf(type) === -1) {
        res.status(400).json({ error: 'Invalid reference type.' }); return;
    }

    try {
        var saved = await Periodical.query().insertAndFetch({
            name: name,
            publisher_name: publisher,
            type: type || null
        });
        auditLogger.info(req.user.email + " created periodical: " + JSON.stringify({ id: saved.id, name: saved.name }));
        req.flash('yay', 'Periodical created.');
        res.json({
            redirect: '/tasks',
            periodical: { id: saved.id, name: saved.name, publisher_name: saved.publisher_name, type: saved.type || '' }
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'A problem occurred saving the periodical.' });
    }
});

router.post('/periodicals/:id(\\d+)', async function (req, res) {
    var name = (req.body.name || '').trim();
    var publisher = (req.body.publisher_name || '').trim();
    var type = (req.body.type || '').trim();
    if (!name) { res.status(400).json({ error: 'Periodical name is required.' }); return; }
    if (!publisher) { res.status(400).json({ error: 'Publisher name is required.' }); return; }
    if (type && validRefTypes.indexOf(type) === -1) {
        res.status(400).json({ error: 'Invalid reference type.' }); return;
    }

    try {
        var periodical = await Periodical.query().findById(req.params.id).throwIfNotFound();
        var oldName = periodical.name;
        var oldPublisher = periodical.publisher_name;
        var oldType = periodical.type;
        await periodical.$query().patch({ name: name, publisher_name: publisher, type: type || null });
        auditLogger.info(req.user.email + " edited periodical " + req.params.id +
            ":\nOriginal: " + JSON.stringify({ name: oldName, publisher_name: oldPublisher, type: oldType }) +
            "\nUpdated: " + JSON.stringify({ name: name, publisher_name: publisher, type: type || null }));
        req.flash('yay', 'Periodical updated.');
        res.json({ redirect: '/tasks' });
    } catch (err) {
        if (err instanceof Periodical.NotFoundError) {
            res.status(404).json({ error: 'Periodical not found.' }); return;
        }
        console.log(err);
        res.status(500).json({ error: 'A problem occurred saving the periodical.' });
    }
});

router.delete('/periodicals/:id(\\d+)', async function (req, res) {
    if (req.user.permission < 1) { res.status(403).json({ error: 'Insufficient permission.' }); return; }

    try {
        var periodical = await Periodical.query().findById(req.params.id).withGraphFetched('issues').throwIfNotFound();
        var issues = periodical.issues || [];
        if (issues.length > 0 && req.query.force !== '1') {
            res.status(409).json({ error: 'Periodical still has issues attached.', issueCount: issues.length });
            return;
        }
        var snapshot = { id: periodical.id, name: periodical.name, issueCount: issues.length };
        if (issues.length > 0) {
            await IssueTodo.query().delete().where('periodical_id', periodical.id);
        }
        await periodical.$query().delete();
        auditLogger.info(req.user.email + " deleted periodical: " + JSON.stringify(snapshot));
        req.flash('yay', 'Periodical deleted.');
        res.json({ redirect: '/tasks' });
    } catch (err) {
        if (err instanceof Periodical.NotFoundError) {
            res.status(404).json({ error: 'Periodical not found.' }); return;
        }
        console.log(err);
        res.status(500).json({ error: 'A problem occurred deleting the periodical.' });
    }
});

// ---------- Issues ----------

function validateDate(v) {
    if (v === undefined || v === null || v === '') return true;
    return DATE_RGX.test(v);
}

router.post('/periodicals/:id(\\d+)/issues/new', async function (req, res) {
    if (!validateDate(req.body.dt)) { res.status(400).json({ error: 'Date must be YYYY, YYYY-MM, or YYYY-MM-DD.' }); return; }
    try {
        var periodical = await Periodical.query().findById(req.params.id).throwIfNotFound();
        var saved = await IssueTodo.query().insertAndFetch({
            periodical_id: periodical.id,
            volume: req.body.volume || null,
            number: req.body.number || null,
            dt: req.body.dt || null,
            link: req.body.link || null
        });
        auditLogger.info(req.user.email + " created issue " + saved.id + " on periodical " + periodical.id);
        res.json({ issue: shapeIssue(saved) });
    } catch (err) {
        if (err instanceof Periodical.NotFoundError) {
            res.status(404).json({ error: 'Periodical not found.' }); return;
        }
        console.log(err);
        res.status(500).json({ error: 'A problem occurred saving the issue.' });
    }
});

router.post('/issues/:id(\\d+)', async function (req, res) {
    if (!validateDate(req.body.dt)) { res.status(400).json({ error: 'Date must be YYYY, YYYY-MM, or YYYY-MM-DD.' }); return; }
    try {
        var issue = await IssueTodo.query().findById(req.params.id).throwIfNotFound();
        await issue.$query().patch({
            volume: req.body.volume || null,
            number: req.body.number || null,
            dt: req.body.dt || null,
            link: req.body.link || null
        });
        var refreshed = await IssueTodo.query().findById(req.params.id).withGraphFetched('editor');
        auditLogger.info(req.user.email + " edited issue " + req.params.id);
        res.json({ issue: shapeIssue(refreshed) });
    } catch (err) {
        if (err instanceof IssueTodo.NotFoundError) {
            res.status(404).json({ error: 'Issue not found.' }); return;
        }
        console.log(err);
        res.status(500).json({ error: 'A problem occurred saving the issue.' });
    }
});

router.post('/issues/:id(\\d+)/complete', async function (req, res) {
    var completed = !!req.body.completed;
    try {
        var issue = await IssueTodo.query().findById(req.params.id).throwIfNotFound();
        await issue.$query().patch({ completed: completed ? 1 : 0 });
        auditLogger.info(req.user.email + " set issue " + req.params.id + " completed=" + completed);
        res.json({ completed: completed });
    } catch (err) {
        if (err instanceof IssueTodo.NotFoundError) {
            res.status(404).json({ error: 'Issue not found.' }); return;
        }
        console.log(err);
        res.status(500).json({ error: 'A problem occurred updating the issue.' });
    }
});

router.post('/issues/:id(\\d+)/claim', async function (req, res) {
    try {
        var issue = await IssueTodo.query().findById(req.params.id).throwIfNotFound();
        await issue.$query().patch({ editor_id: req.user.id });
        auditLogger.info(req.user.email + " claimed issue " + req.params.id);
        res.json({ editor: { id: req.user.id, name: req.user.name || req.user.email } });
    } catch (err) {
        if (err instanceof IssueTodo.NotFoundError) {
            res.status(404).json({ error: 'Issue not found.' }); return;
        }
        console.log(err);
        res.status(500).json({ error: 'A problem occurred updating the issue.' });
    }
});

router.post('/issues/:id(\\d+)/release', async function (req, res) {
    try {
        var issue = await IssueTodo.query().findById(req.params.id).throwIfNotFound();
        if (issue.editor_id && issue.editor_id !== req.user.id && req.user.permission < 1) {
            res.status(403).json({ error: 'Only the assignee or a delete-permission editor can release.' });
            return;
        }
        await issue.$query().patch({ editor_id: null });
        auditLogger.info(req.user.email + " released issue " + req.params.id);
        res.json({ editor: null });
    } catch (err) {
        if (err instanceof IssueTodo.NotFoundError) {
            res.status(404).json({ error: 'Issue not found.' }); return;
        }
        console.log(err);
        res.status(500).json({ error: 'A problem occurred updating the issue.' });
    }
});

router.post('/issues/:id(\\d+)/assign', async function (req, res) {
    if (req.user.permission < 1) { res.status(403).json({ error: 'Insufficient permission.' }); return; }
    var editorId = parseInt(req.body.editor_id, 10);
    if (isNaN(editorId)) { res.status(400).json({ error: 'editor_id required.' }); return; }
    try {
        var issue = await IssueTodo.query().findById(req.params.id).throwIfNotFound();
        var user = await User.query().findById(editorId).throwIfNotFound();
        await issue.$query().patch({ editor_id: editorId });
        auditLogger.info(req.user.email + " assigned issue " + req.params.id + " to user " + editorId);
        res.json({ editor: { id: user.id, name: user.name || user.email } });
    } catch (err) {
        if (err instanceof IssueTodo.NotFoundError || err instanceof User.NotFoundError) {
            res.status(404).json({ error: 'Issue or user not found.' }); return;
        }
        console.log(err);
        res.status(500).json({ error: 'A problem occurred updating the issue.' });
    }
});

router.delete('/issues/:id(\\d+)', async function (req, res) {
    if (req.user.permission < 1) { res.status(403).json({ error: 'Insufficient permission.' }); return; }
    try {
        var issue = await IssueTodo.query().findById(req.params.id).throwIfNotFound();
        var snap = { id: issue.id, periodical_id: issue.periodical_id, volume: issue.volume, number: issue.number };
        await issue.$query().delete();
        auditLogger.info(req.user.email + " deleted issue: " + JSON.stringify(snap));
        res.json({ deleted: true });
    } catch (err) {
        if (err instanceof IssueTodo.NotFoundError) {
            res.status(404).json({ error: 'Issue not found.' }); return;
        }
        console.log(err);
        res.status(500).json({ error: 'A problem occurred deleting the issue.' });
    }
});

// ---------- General TODOs ----------

router.post('/general/new', async function (req, res) {
    var description = (req.body.description || '').trim();
    if (!description) { res.status(400).json({ error: 'Description is required.' }); return; }
    if (!validateDate(req.body.dt)) { res.status(400).json({ error: 'Date must be YYYY, YYYY-MM, or YYYY-MM-DD.' }); return; }

    try {
        var saved = await GeneralTodo.query().insertAndFetch({
            description: description,
            dt: req.body.dt || null,
            link: req.body.link || null
        });
        auditLogger.info(req.user.email + " created general todo " + saved.id);
        res.json({ redirect: '/tasks', todo: shapeGeneral(saved) });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'A problem occurred saving the task.' });
    }
});

router.post('/general/:id(\\d+)', async function (req, res) {
    var description = (req.body.description || '').trim();
    if (!description) { res.status(400).json({ error: 'Description is required.' }); return; }
    if (!validateDate(req.body.dt)) { res.status(400).json({ error: 'Date must be YYYY, YYYY-MM, or YYYY-MM-DD.' }); return; }

    try {
        var todo = await GeneralTodo.query().findById(req.params.id).throwIfNotFound();
        await todo.$query().patch({
            description: description,
            dt: req.body.dt || null,
            link: req.body.link || null
        });
        var refreshed = await GeneralTodo.query().findById(req.params.id).withGraphFetched('editor');
        auditLogger.info(req.user.email + " edited general todo " + req.params.id);
        res.json({ todo: shapeGeneral(refreshed) });
    } catch (err) {
        if (err instanceof GeneralTodo.NotFoundError) {
            res.status(404).json({ error: 'Task not found.' }); return;
        }
        console.log(err);
        res.status(500).json({ error: 'A problem occurred saving the task.' });
    }
});

router.post('/general/:id(\\d+)/complete', async function (req, res) {
    var completed = !!req.body.completed;
    try {
        var todo = await GeneralTodo.query().findById(req.params.id).throwIfNotFound();
        await todo.$query().patch({ completed: completed ? 1 : 0 });
        auditLogger.info(req.user.email + " set general todo " + req.params.id + " completed=" + completed);
        res.json({ completed: completed });
    } catch (err) {
        if (err instanceof GeneralTodo.NotFoundError) {
            res.status(404).json({ error: 'Task not found.' }); return;
        }
        console.log(err);
        res.status(500).json({ error: 'A problem occurred updating the task.' });
    }
});

router.post('/general/:id(\\d+)/claim', async function (req, res) {
    try {
        var todo = await GeneralTodo.query().findById(req.params.id).throwIfNotFound();
        await todo.$query().patch({ editor_id: req.user.id });
        auditLogger.info(req.user.email + " claimed general todo " + req.params.id);
        res.json({ editor: { id: req.user.id, name: req.user.name || req.user.email } });
    } catch (err) {
        if (err instanceof GeneralTodo.NotFoundError) {
            res.status(404).json({ error: 'Task not found.' }); return;
        }
        console.log(err);
        res.status(500).json({ error: 'A problem occurred updating the task.' });
    }
});

router.post('/general/:id(\\d+)/release', async function (req, res) {
    try {
        var todo = await GeneralTodo.query().findById(req.params.id).throwIfNotFound();
        if (todo.editor_id && todo.editor_id !== req.user.id && req.user.permission < 1) {
            res.status(403).json({ error: 'Only the assignee or a delete-permission editor can release.' });
            return;
        }
        await todo.$query().patch({ editor_id: null });
        auditLogger.info(req.user.email + " released general todo " + req.params.id);
        res.json({ editor: null });
    } catch (err) {
        if (err instanceof GeneralTodo.NotFoundError) {
            res.status(404).json({ error: 'Task not found.' }); return;
        }
        console.log(err);
        res.status(500).json({ error: 'A problem occurred updating the task.' });
    }
});

router.post('/general/:id(\\d+)/assign', async function (req, res) {
    if (req.user.permission < 1) { res.status(403).json({ error: 'Insufficient permission.' }); return; }
    var editorId = parseInt(req.body.editor_id, 10);
    if (isNaN(editorId)) { res.status(400).json({ error: 'editor_id required.' }); return; }
    try {
        var todo = await GeneralTodo.query().findById(req.params.id).throwIfNotFound();
        var user = await User.query().findById(editorId).throwIfNotFound();
        await todo.$query().patch({ editor_id: editorId });
        auditLogger.info(req.user.email + " assigned general todo " + req.params.id + " to user " + editorId);
        res.json({ editor: { id: user.id, name: user.name || user.email } });
    } catch (err) {
        if (err instanceof GeneralTodo.NotFoundError || err instanceof User.NotFoundError) {
            res.status(404).json({ error: 'Task or user not found.' }); return;
        }
        console.log(err);
        res.status(500).json({ error: 'A problem occurred updating the task.' });
    }
});

router.delete('/general/:id(\\d+)', async function (req, res) {
    if (req.user.permission < 1) { res.status(403).json({ error: 'Insufficient permission.' }); return; }
    try {
        var todo = await GeneralTodo.query().findById(req.params.id).throwIfNotFound();
        var snap = { id: todo.id, description: todo.description };
        await todo.$query().delete();
        auditLogger.info(req.user.email + " deleted general todo: " + JSON.stringify(snap));
        res.json({ deleted: true });
    } catch (err) {
        if (err instanceof GeneralTodo.NotFoundError) {
            res.status(404).json({ error: 'Task not found.' }); return;
        }
        console.log(err);
        res.status(500).json({ error: 'A problem occurred deleting the task.' });
    }
});

module.exports = router;
