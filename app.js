var express       = require('express');
var path          = require('path');
var favicon       = require('serve-favicon');
var logger        = require('morgan');
var cookieParser  = require('cookie-parser');
var bodyParser    = require('body-parser');
var hbs           = require('hbs');

var passport      = require('passport');
var flash         = require('connect-flash');
var session       = require('express-session');

var index         = require('./routes/index');
var users         = require('./routes/users');
var refs          = require('./routes/refs');
var login         = require('./routes/login');
var signup        = require('./routes/signup');
var logout        = require('./routes/logout');
var profile       = require('./routes/profile');

var bookshelf     = require('./config/database.js');

var app = express();

// Configuration ===============================================================

require('./config/passport')(passport); // pass passport for configuration

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');
hbs.registerPartials(__dirname + '/views/partials');

app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev')); // log every request to the console
app.use(bodyParser.json()); // get information from html forms
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser()); // read cookies (needed for auth)
app.use(express.static(path.join(__dirname, 'public')));

// required for passport
app.use(session({ secret: '89S8e1rDYIfjXMpWYgGp8hcfINnvSa' })); // session secret
app.use(passport.initialize());
app.use(passport.session()); // persistent login sessions
app.use(flash()); // use connect-flash for flash messages stored in session


// routes ======================================================================

// route middleware to make sure a user is logged in
function isLoggedIn(req, res, next) {
  
      // if user is authenticated in the session, carry on 
      if (req.isAuthenticated())
          return next();
  
      // if they aren't redirect them to the login page
      res.redirect('/login');
  }

// Route middleware to only allow users with an invitation key to access.
// Meant to control user sign ups
function invitationKey(req, res, next) {
    if (req.isAuthenticated())
        return next();
    
    res.redirect('/');
}

//require('./app/routes.js')(app, passport); // load our routes and pass in our app and fully configured passport

app.use('/',        index);
app.use('/login',   login);
app.use('/logout',  logout);
app.use('/signup',  signup);

app.use('/profile',   isLoggedIn, profile);
app.use('/refs',      isLoggedIn, refs);
//app.use('/sources',   isLoggedIn, sources);
//app.use('/campaigns', isLoggedIn, campaigns);
//app.use('/site',      isLoggedIn, site);
//app.use('/users',     isLoggedIn, users);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
