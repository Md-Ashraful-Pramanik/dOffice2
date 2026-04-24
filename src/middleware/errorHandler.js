const { AppError } = require('../utils/errors');

function errorHandler(error, _req, res, _next) {
  if (error instanceof AppError) {
    if (error.status === 422 && error.details?.errors) {
      return res.status(422).json({ errors: error.details.errors });
    }

    return res.status(error.status).json({
      error: {
        status: error.status,
        message: error.message
      }
    });
  }

  return res.status(500).json({
    error: {
      status: 500,
      message: 'An unexpected error occurred. Please try again.'
    }
  });
}

module.exports = { errorHandler };
