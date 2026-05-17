var express = require('express');
var router = express.Router();
var logStats = require('../server/log-stats');

router.get('/', async function (req, res, next) {
    try {
        var stats = await logStats.getStats();
        req.replacements.stats = stats;
        req.replacements.statsJson = JSON.stringify(stats);
        req.replacements.statActive = 1;
        res.render('stats', req.replacements);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
