var self = this;

var nodemailer = require('nodemailer');
var aws = require('@aws-sdk/client-ses');

const ses = new aws.SES({
    region: 'us-east-1'
});

self.sesTransporter = nodemailer.createTransport({
    SES: {ses, aws}
});

self.sendResetMail = function(req, email, token){
    var mailOptions = {
        to: email,
        from: 'PasswordReset@rad.creationeducation.org',
        subject: 'RAD Admin Account Password Reset',
        text: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
          'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
          'https://' + req.get('Host') + '/reset/' + token + '\n\n' +
          'If you did not request this, please ignore this email and your password will remain unchanged.\n'
    };
    return self.sesTransporter.sendMail(mailOptions);
};

self.sendInviteMail = function(req, email, token){
    var mailOptions = {
        to: email,
        from: 'DoNotReply@rad.creationeducation.org',
        subject: 'RAD Admin Account Invitation',
        text: 'You are receiving this because you have been invited to create an administration account for the Creation Education Resources Research Assistance Database.\n\n' +
          'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
          'https://' + req.get('Host') + '/signup/' + token + '\n\n' +
          'If you believe you have received this in error, please ignore this email.\n'
    };
    return self.sesTransporter.sendMail(mailOptions);
};

self.sendPassChangeConfirmation = function(email){
    var mailOptions = {
        to: email,
        from: 'PasswordReset@rad.creationeducation.org',
        subject: 'Your RAD Admin password has been changed',
        text: 'Hello,\n\n' +
            'This is a confirmation that the password for your account ' + email + ' has just been changed.\n'
    };
    return self.sesTransporter.sendMail(mailOptions);
};

module.exports = self;