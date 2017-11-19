var self = this;

var nodemailer = require('nodemailer');
self.AWS = require('aws-sdk');

self.AWS.config.update({
    region: 'us-east-1'
});

self.sesTransporter = nodemailer.createTransport({
    SES: new self.AWS.SES()
});

self.sendResetMail = function(req, email, token){
    var mailOptions = {
        to: email,
        from: 'passwordreset@rad.creationeducation.org',
        subject: 'RAD Admin Account Password Reset',
        text: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
          'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
          'https://' + req.get('Host') + '/reset/' + token + '\n\n' +
          'If you did not request this, please ignore this email and your password will remain unchanged.\n'
    };
    return self.sesTransporter.sendMail(mailOptions);
};

self.sendPassChangeConfirmation = function(email){
    var mailOptions = {
        to: email,
        from: 'passwordreset@rad.creationeducation.org',
        subject: 'Your RAD Admin password has been changed',
        text: 'Hello,\n\n' +
            'This is a confirmation that the password for your account ' + email + ' has just been changed.\n'
    };
    return self.sesTransporter.sendMail(mailOptions);
};

module.exports = self;