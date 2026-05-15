const bcrypt = require('bcryptjs');

const users = [
  {
    name: 'Admin User',
    email: 'admin@phones.com',
    password: bcrypt.hashSync('123456', 10),
    isAdmin: true,
  },
  {
    name: 'John Doe',
    email: 'john@example.com',
    password: bcrypt.hashSync('123456', 10),
    isAdmin: false,
  },
];

module.exports = users;