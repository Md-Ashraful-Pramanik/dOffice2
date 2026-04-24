class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function validationError(fields) {
  return new AppError(422, 'Validation error', { errors: fields });
}

function unauthorized(message = 'Missing or invalid authentication token.') {
  return new AppError(401, message);
}

function forbidden(message = 'You do not have permission to perform this action.') {
  return new AppError(403, message);
}

function notFound(message = 'Resource not found.') {
  return new AppError(404, message);
}

module.exports = {
  AppError,
  validationError,
  unauthorized,
  forbidden,
  notFound
};
