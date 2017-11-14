var express          = require('express');
var path             = require('path');
var favicon          = require('serve-favicon');
var logger           = require('morgan');
var cookieParser     = require('cookie-parser');
var bodyParser       = require('body-parser');
var hbs              = require('hbs');
var flash            = require('connect-flash');
var session          = require('express-session');
var KnexSessionStore = require('connect-session-knex')(session);

var passport         = require('./config/passport');
var bookshelf        = require('./config/bookshelf');
var knex             = require('./config/database');

var app = express();

// Configuration ===============================================================

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');
hbs.registerPartials(__dirname + '/views/partials');

app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev')); // log every request to the console
app.use(bodyParser.json()); // get information from html forms
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser()); // read cookies (needed for auth)

// Session setup required for passport
var store = new KnexSessionStore({
    knex: knex,
    createtable: true
});

app.use(session({ 
    secret: '89S8e1rDYIfjXMpWYgGp8hcfINnvSa',
    store: store
 })); // session secret
app.use(passport.initialize());
app.use(passport.session()); // persistent login sessions
app.use(flash()); // use connect-flash for flash messages stored in session


// custom middleware =============================================================

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

// routes ======================================================================

app.use(express.static(path.join(__dirname, 'public')));

// Private directory is for scripts that will only be transferred if the user is logged in.
app.all('/private/*', isLoggedIn); // This must come before the next line
app.use('/private', express.static(path.join(__dirname, 'private')));


app.use('/',        require('./routes/index'));
app.use('/login',   require('./routes/login'));
app.use('/logout',  require('./routes/logout'));
app.use('/signup',  require('./routes/signup'));
//app.use('/signup', invitationKey, require('./routes/signup'));

app.use('/profile',   isLoggedIn, require('./routes/profile'));
app.use('/refs',      isLoggedIn, require('./routes/refs'));
//app.use('/sources',   isLoggedIn, require('./routes/sources'));
//app.use('/campaigns', isLoggedIn, require('./routes/campaigns'));
//app.use('/site',      isLoggedIn, require('./routes/site'));
//app.use('/users',     isLoggedIn, require('./routes/users'));

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
