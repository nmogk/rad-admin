var schema = {
    users: {
        id: {type: 'increments', nullable: false, primary: true},
        email: {type: 'string', maxlength: 254, nullable: false, unique: true},
        password: {type: 'string', maxlength: 150, nullable: false},
        name: {type: 'string', maxlength: 150, nullable: true}
    },
    campaigns: {
        id: {type: 'increments', nullable: false, primary: true},
        name: {type: 'string', maxlength: 150, nullable: false},
        description: {type: 'text', fieldType: 'text'},
        refs: {type: 'json'}
    }
    
  };
  module.exports = schema;