'use strict';

const schema = require('./schema');

function makeError(reason, detail = {}) {
  return {
    ok: false,
    reason,
    ...detail
  };
}

module.exports = {
  ...schema,
  makeError
};
