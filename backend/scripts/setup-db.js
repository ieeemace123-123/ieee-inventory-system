/**
 * setup-db.js
 * Run this once to create the PostgreSQL database before starting the server.
 * Usage: node scripts/setup-db.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

// Parse the DATABASE_URL to connect to 'postgres' default DB first
const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/ieee_inventory';
const url = new URL(dbUrl);
const dbName = url.pathname.replace('/', ''); // e.g. 'ieee_inventory'

// Connect to the default 'postgres' database to create our target DB
const client = new Client({
  host: url.hostname,
  port: parseInt(url.port) || 5432,
  user: url.username,
  password: url.password,
  database: 'postgres', // connect to default db
});

async function setupDatabase() {
  try {
    await client.connect();
    console.log(`[Setup] Connected to PostgreSQL as "${url.username}".`);

    // Check if database already exists
    const result = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (result.rowCount > 0) {
      console.log(`[Setup] ✅ Database "${dbName}" already exists. No action needed.`);
    } else {
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`[Setup] ✅ Database "${dbName}" created successfully!`);
    }

    console.log(`[Setup] 🚀 You can now run: npm start`);
  } catch (err) {
    console.error('[Setup] ❌ Failed to create database:', err.message);
    if (err.code === '28P01') {
      console.error('[Setup]    → Wrong password for PostgreSQL user. Update DATABASE_URL in .env');
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

setupDatabase();
