function isValidId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function reject(status, message) {
  const error = new Error(message);
  error.status = status;
  error.isPublic = true;
  throw error;
}

module.exports = { isValidId, reject };
