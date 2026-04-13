var schema = {
    users: {
        id: {type: 'increments', nullable: false, primary: true},
        email: {type: 'string', maxlength: 254, nullable: false, unique: true},
        password_digest: {type: 'string', maxlength: 150, nullable: false},
        name: {type: 'string', maxlength: 150, nullable: true},
        permission: {type: 'integer', unsigned: true, defaultTo: 0},
        validated: {type: 'boolean', defaultTo: 0},
        pending_email: {type: 'string', maxlength: 254, nullable: true},
        last_login: {type: 'dateTime', nullable: true}
    },
    campaigns: {
        id: {type: 'increments', nullable: false, primary: true},
        name: {type: 'string', maxlength: 150, nullable: false},
        description: {type: 'text', fieldType: 'text'},
        refs: {type: 'longtext'}
    },
    invitations: {
        token: {type: 'string', maxlength: 150, primary: true},
        expires: {type: 'dateTime', nullable: false},
        user_id: {type: 'integer', unsigned: true, references: 'users.id', unique: true}
    },
    site_content: {
        id: {type: 'increments', nullable: false, primary: true},
        section_key: {type: 'string', maxlength: 100, nullable: false, unique: true},
        title: {type: 'string', maxlength: 255, nullable: true},
        content: {type: 'longtext', nullable: true},
        updated_at: {type: 'dateTime', nullable: true},
        updated_by: {type: 'string', maxlength: 254, nullable: true}
    }

  };
  module.exports = schema;