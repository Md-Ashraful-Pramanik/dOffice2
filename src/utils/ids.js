const { randomUUID } = require('crypto');

function prefixedId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

module.exports = { prefixedId };
