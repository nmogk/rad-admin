var fs = require('fs').promises;

var DB_PATH = 'database.json';

// Single-process async mutex. Every read-modify-write op runs through `withLock`
// so concurrent requests can't interleave their reads and writes. Single-process
// only — see issue tracking if this app ever scales horizontally.
var mutex = Promise.resolve();
function withLock(fn) {
    var next = mutex.then(fn);
    mutex = next.catch(function () {});
    return next;
}

async function read() {
    return JSON.parse(await fs.readFile(DB_PATH));
}

async function write(dbParams) {
    await fs.writeFile(DB_PATH, JSON.stringify(dbParams));
}

async function getHighestId() {
    return (await read()).highestId;
}

function toIsoDate(d) {
    return d.toISOString().slice(0, 10);
}

function bumpLatestIfNewer(dbParams, newDocDate) {
    if (!newDocDate) return;
    var inputDate = new Date(newDocDate);
    var latestRefDate = new Date(dbParams.latest);
    if (latestRefDate < inputDate) {
        dbParams.latest = toIsoDate(inputDate);
    }
}

// Atomically bump highestId and return the new value. The caller stamps it on
// the doc before posting to Solr; if the Solr add fails the id is "lost" (a
// gap in the sequence), but never reused.
function reserveId() {
    return withLock(async function () {
        var dbParams = await read();
        dbParams.highestId = dbParams.highestId + 1;
        await write(dbParams);
        return dbParams.highestId;
    });
}

function recordInsert(newDocDate) {
    return withLock(async function () {
        var dbParams = await read();
        bumpLatestIfNewer(dbParams, newDocDate);
        dbParams.updated = toIsoDate(new Date());
        dbParams.numRecords = dbParams.numRecords + 1;
        await write(dbParams);
        return dbParams;
    });
}

function recordEdit(newDocDate) {
    return withLock(async function () {
        var dbParams = await read();
        bumpLatestIfNewer(dbParams, newDocDate);
        dbParams.updated = toIsoDate(new Date());
        await write(dbParams);
        return dbParams;
    });
}

// Note: `latest` may become stale if the deleted doc had the latest date.
// Regenerate via replaceStats() (driven by a full Solr scan) — there's no
// way to detect it from this side alone.
function recordDelete() {
    return withLock(async function () {
        var dbParams = await read();
        dbParams.updated = toIsoDate(new Date());
        dbParams.numRecords = dbParams.numRecords - 1;
        await write(dbParams);
        return dbParams;
    });
}

// Overwrites latest/numRecords/highestId with values from a full-index scan
// (issue #83). Returns { before, after, changes } so the caller can show the
// admin what changed. `latest` is left alone when the scan produced none
// (empty index or no docs with dt) so we don't lose the prior value.
function replaceStats(stats) {
    return withLock(async function () {
        var before = await read();
        var after = Object.assign({}, before);
        after.numRecords = stats.numRecords;
        after.highestId = stats.highestId;
        if (stats.latest) after.latest = stats.latest;

        var changes = {};
        ['numRecords', 'highestId', 'latest'].forEach(function (k) {
            if (before[k] !== after[k]) changes[k] = { from: before[k], to: after[k] };
        });

        await write(after);
        return { before: before, after: after, changes: changes };
    });
}

module.exports = { read, getHighestId, reserveId, recordInsert, recordEdit, recordDelete, replaceStats };
