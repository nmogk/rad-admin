var express = require('express');
var router = express.Router();

// =====================================
// SIGNUP ==============================
// =====================================
// show the signup form


router.get('/', function(req, res, next) {
    res.render('signup', { message: req.flash('signupMessage') });
});


// process the signup form
// router.post('/', do all our passport stuff here);


module.exports = router;