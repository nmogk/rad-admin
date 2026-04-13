var self = this;

var nodemailer = require('nodemailer');
var { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');

var sesClient = new SESv2Client({
    region: 'us-east-1'
});

self.sesTransporter = nodemailer.createTransport({
    SES: { sesClient, SendEmailCommand }
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

self.sendEmailVerification = function(req, newEmail, token){
    var mailOptions = {
        to: newEmail,
        from: 'DoNotReply@rad.creationeducation.org',
        subject: 'RAD Admin Email Change Verification',
        text: 'You are receiving this because an email change was requested for your RAD Admin account.\n\n' +
          'Please click on the following link, or paste this into your browser to confirm this new email address:\n\n' +
          'https://' + req.get('Host') + '/profile/verify/' + token + '\n\n' +
          'If you did not request this, please ignore this email.\n'
    };
    return self.sesTransporter.sendMail(mailOptions);
};

self.sendEmailChangeNotice = function(oldEmail, newEmail){
    var mailOptions = {
        to: oldEmail,
        from: 'DoNotReply@rad.creationeducation.org',
        subject: 'RAD Admin Email Change Requested',
        text: 'Hello,\n\n' +
            'This is a notification that a request has been made to change the email address on your RAD Admin account from ' + oldEmail + ' to ' + newEmail + '.\n\n' +
            'If you did not make this request, please contact your administrator immediately.\n'
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