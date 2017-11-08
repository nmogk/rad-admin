var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index');
});

router.get('/printAggregator.html', function(req, res, next) {
  res.render('printAggregator');
});

module.exports = router;
