const { database, databasePath, initializeDatabase } = require("../database");

try {
  initializeDatabase(process.argv.includes("--reset"));
  console.log(`Baza demonstracyjna jest gotowa: ${databasePath}`);
} finally {
  database.close();
}
