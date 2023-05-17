var express = require('express');
var router = express.Router();

// =====================================
// LOGOUT ==============================
// =====================================
router.get('/', function(req, res) {
    req.logout();
    res.redirect(303, '/');
});

module.exports = router;