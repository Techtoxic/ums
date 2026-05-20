/* eslint-disable */
// Drizzle Kit configuration — uses CommonJS to match server.js style.
require('dotenv').config();

module.exports = {
    schema: './drizzle/schema.js',
    out: './drizzle/migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL,
    },
    strict: true,
    verbose: true,
};
