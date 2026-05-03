var express = require('express');
var router = express.Router();
var path = require('path');
var fs = require('fs');
var log4js = require('log4js');
var auditLogger = log4js.getLogger('audit');
var backup = require('../server/solr-backup');

var BACKUP_DIR = path.join(__dirname, '..', 'backups');
var VALID_CORES = ['rad', 'source'];

// Backup filenames are server-generated; this regex defends DELETE against
// path traversal and accidental deletion of unrelated files in the dir.
var FILENAME_RE = /^(rad|source)-\d{8}-\d{6}\.json$/;

function pad(n, w) {
    var s = String(n);
    while (s.length < w) s = '0' + s;
    return s;
}

function timestamp(d) {
    return d.getFullYear() +
        pad(d.getMonth() + 1, 2) +
        pad(d.getDate(), 2) + '-' +
        pad(d.getHours(), 2) +
        pad(d.getMinutes(), 2) +
        pad(d.getSeconds(), 2);
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function listBackups() {
    var names;
    try {
        names = await fs.promises.readdir(BACKUP_DIR);
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
    var backups = names.filter(function (n) { return FILENAME_RE.test(n); });
    var rows = await Promise.all(backups.map(async function (name) {
        var st = await fs.promises.stat(path.join(BACKUP_DIR, name));
        var m = name.match(FILENAME_RE);
        return {
            name: name,
            core: m[1],
            size: st.size,
            sizeFormatted: formatSize(st.size),
            mtime: st.mtime.toISOString()
        };
    }));
    rows.sort(function (a, b) { return a.mtime < b.mtime ? 1 : -1; });
    return rows;
}

router.get('/', async function (req, res, next) {
    try {
        req.replacements.dbActive = 1;
        req.replacements.backups = await listBackups();
        res.render('database', req.replacements);
    } catch (err) {
        next(err);
    }
});

router.post('/backup', async function (req, res, next) {
    var core = req.body && req.body.core;
    if (core !== 'rad' && core !== 'source' && core !== 'both') {
        res.status(400).json({ error: 'Invalid core. Must be rad, source, or both.' });
        return;
    }

    var cores = core === 'both' ? VALID_CORES.slice() : [core];
    var written = [];

    try {
        await fs.promises.mkdir(BACKUP_DIR, { recursive: true });
        var ts = timestamp(new Date());
        for (var i = 0; i < cores.length; i++) {
            var c = cores[i];
            var buf = await backup.exportCore(c);
            var name = c + '-' + ts + '.json';
            await fs.promises.writeFile(path.join(BACKUP_DIR, name), buf);
            written.push(name);
        }
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'A problem occurred during backup.' });
        return;
    }

    auditLogger.info(req.user.get('email') + ' created backup(s): ' + written.join(', '));
    req.flash('yay', 'Backup created: ' + written.join(', '));
    res.json({ redirect: '/database' });
});

router.delete('/backup/:filename', async function (req, res, next) {
    var name = req.params.filename;
    if (!FILENAME_RE.test(name)) {
        res.status(400).json({ error: 'Invalid backup filename.' });
        return;
    }

    try {
        await fs.promises.unlink(path.join(BACKUP_DIR, name));
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Could not delete backup.' });
        return;
    }

    auditLogger.info(req.user.get('email') + ' deleted backup: ' + name);
    req.flash('yay', 'Backup deleted: ' + name);
    res.json({ redirect: '/database' });
});

module.exports = router;
