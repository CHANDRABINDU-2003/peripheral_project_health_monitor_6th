/**
 * Shared PrismaClient singleton.
 *
 * Import this everywhere instead of calling `new PrismaClient()` per module —
 * a single instance prevents exhausting the database connection pool.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
