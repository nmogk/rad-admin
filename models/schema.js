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
    },
    periodicals: {
        id: {type: 'increments', nullable: false, primary: true},
        name: {type: 'string', maxlength: 255, nullable: false},
        publisher_name: {type: 'string', maxlength: 255, nullable: false},
        type: {type: 'string', maxlength: 50, nullable: true},
        updated_at: {type: 'dateTime', nullable: true}
    },
    issue_todos: {
        id: {type: 'increments', nullable: false, primary: true},
        periodical_id: {type: 'integer', unsigned: true, nullable: false, references: 'periodicals.id'},
        volume: {type: 'string', maxlength: 50, nullable: true},
        number: {type: 'string', maxlength: 50, nullable: true},
        dt: {type: 'string', maxlength: 32, nullable: true},
        link: {type: 'string', maxlength: 2083, nullable: true},
        editor_id: {type: 'integer', unsigned: true, nullable: true, references: 'users.id'},
        completed: {type: 'boolean', defaultTo: 0},
        updated_at: {type: 'dateTime', nullable: true}
    },
    general_todos: {
        id: {type: 'increments', nullable: false, primary: true},
        description: {type: 'text', nullable: false},
        dt: {type: 'string', maxlength: 32, nullable: true},
        link: {type: 'string', maxlength: 2083, nullable: true},
        editor_id: {type: 'integer', unsigned: true, nullable: true, references: 'users.id'},
        completed: {type: 'boolean', defaultTo: 0},
        updated_at: {type: 'dateTime', nullable: true}
    }

  };
  module.exports = schema;