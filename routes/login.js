var express = require('express');
var router = express.Router();

// =====================================
// LOGIN ===============================
// =====================================
// show the login form
router.get('/', function(req, res, next) {
    res.render('login', { message: req.flash('loginMessage') });
});

// process the login form
// router.post('/', do all our passport stuff here);

module.exports = router;