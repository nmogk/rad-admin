var passwordValidator = require('password-validator');
 
// Create a schema 
var schema = new passwordValidator();
 
// Add properties to it 
schema
.is().min(8)                                    // Minimum length 8 
.is().max(72)                                   // Maximum length 100 (from bcrypt)
.has().uppercase()                              // Must have uppercase letters 
.has().lowercase()                              // Must have lowercase letters 
.has().digits()                                 // Must have digits 
.has().not().spaces();                          // Should not have spaces

module.exports = schema;