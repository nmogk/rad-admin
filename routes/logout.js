var express = require('express');
var router = express.Router();

// =====================================
// LOGOUT ==============================
// =====================================
app.get('/', function(req, res) {
    req.logout();
    res.redirect('/');
});

module.exports = router;