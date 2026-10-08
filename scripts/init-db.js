const { database, databasePath } = require("../database");
const { initializeDatabase } = require("../services/demoService");

try {
  initializeDatabase(process.argv.includes("--reset"));
  console.log(`Baza demonstracyjna jest gotowa: ${databasePath}`);
} finally {
  database.close();
}
