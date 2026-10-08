const path = require("node:path");
const databasePath = path.resolve(
  process.env.MEDIDESK_DB_PATH ||
    path.join(__dirname, "..", "data", "medidesk.sqlite"),
);

module.exports = { databasePath };
