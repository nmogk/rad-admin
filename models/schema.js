var schema = {
    users: {
        id: {type: 'increments', nullable: false, primary: true},
        email: {type: 'string', maxlength: 254, nullable: false, unique: true},
        password_digest: {type: 'string', maxlength: 150, nullable: false},
        name: {type: 'string', maxlength: 150, nullable: true},
        permission: {type: 'integer', unsigned: true, defaultTo: 0},
        validated: {type: 'boolean', defaultTo: 0}
    },
    campaigns: {
        id: {type: 'increments', nullable: false, primary: true},
        name: {type: 'string', maxlength: 150, nullable: false},
        description: {type: 'text', fieldType: 'text'},
        refs: {type: 'json'}
    },
    invitations: {
        token: {type: 'string', maxlength: 150, primary: true},
        expires: {type: 'date', nullable: false},
        user_id: {type: 'integer', unsigned: true, references: 'users.id'}
    }
    
  };
  module.exports = schema;