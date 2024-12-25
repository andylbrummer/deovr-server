#!/usr/bin/env node

const program = require('commander');
const express = require('express');
const path = require('path');
const fs = require('fs');
const handleStaticFiles = require('./fileHandler');

const app = express();

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

function tryPort(port, maxAttempts = 5) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port)
      .on('listening', () => {
        resolve({ server, port });
      })
      .on('error', (err) => {
        if (err.code === 'EADDRINUSE' && maxAttempts > 1) {
          resolve(tryPort(port + 1, maxAttempts - 1));
        } else {
          reject(err);
        }
      });
  });
}

program
  .version('1.0.0')
  .argument('[directory]', 'Directory to serve')
  .option('-p, --port <number>', 'Port to run server on', process.env.DEOVR_LIST_PORT || '3000')
  .action(async (directory, options) => {
    const absolutePath = path.resolve(directory || process.env.DEOVR_LIST_PATH || '.');
    const initialPort = parseInt(options.port);

    app.get('/api/files', (req, res) => {
      const requestedPath = req.query.path || '';
      const fullPath = path.join(absolutePath, requestedPath);

      try {
        const items = fs.readdirSync(fullPath);
        const fileList = items.map(item => {
          const itemPath = path.join(fullPath, item);
          const stats = fs.statSync(itemPath);
          return {
            name: item,
            isDirectory: stats.isDirectory(),
            size: stats.size,
            path: path.join(requestedPath, encodeURIComponent(item))
          };
        });
        res.json(fileList);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.use(handleStaticFiles.bind(null, absolutePath));
    
    app.get('/:path(*)', (req, res) => {
      const requestedPath = req.params.path || '';
      const fullPath = path.join(absolutePath, requestedPath);
  
      try {
        const items = fs.readdirSync(fullPath).map(item => {
          const itemPath = path.join(fullPath, item);
          const stats = fs.statSync(itemPath);
          return {
            name: item,
            isDirectory: stats.isDirectory(),    
            size: stats.size,
            path: path.join(requestedPath, encodeURIComponent(item))
          };
        });
    
        res.render('index', {
          items: items,
          currentPath: req.path
        });
      } catch (error) {
        res.status(500).render('error', { error: error.message });
      }
    });
    try {
      const { port } = await tryPort(initialPort);
      console.log(`Server running at http://localhost:${port}`);
    } catch (err) {
      console.error('Failed to start server:', err.message);
      process.exit(1);
    }
  });

program.parse();

const favicon = require('serve-favicon');

app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
