'use strict';

const express = require('express');
const cors = require('cors');
const applicationsRouter = require('./routes/applications');

function createApp() {
  const app = express();

  // Allow the Vue dev server and the NGINX entry point to call the API.
  // Same-origin /api requests proxied by NGINX need no CORS headers, but the
  // allow-list entries make :8080/:5173 first-class origins.
  app.use(
    cors({
      origin: ['http://localhost:5173', 'http://localhost:8080']
    })
  );

  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/applications', applicationsRouter);

  // Malformed JSON bodies -> 400 (instead of an HTML error page).
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
      return res.status(400).json({
        type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
        title: 'One or more validation errors occurred.',
        status: 400,
        errors: { '': ['Invalid request body.'] }
      });
    }
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ message: 'An unexpected error occurred.' });
  });

  return app;
}

module.exports = { createApp };
