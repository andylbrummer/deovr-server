#!/usr/bin/env node

const express = require('express');
const path = require('path');
const { program } = require('commander');
const { getVideoMetadata, handleStaticFiles, moveFileToRemove, restoreFileFromRemove } = require('./fileHandler');
const favicon = require('serve-favicon');
const fs = require('fs');

const app = express();

async function tryPort(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port)
      .on('listening', () => resolve({ server, port }))
      .on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          tryPort(port + 1).then(resolve, reject);
        } else {
          reject(err);
        }
      });
  });
}

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

program
  .version('1.0.0')
  .argument('[directory]', 'Directory to serve')
  .option('-p, --port <number>', 'Port to run server on', process.env.DEOVR_LIST_PORT || '3000')
  .action(async (directory, options) => {
    const absolutePath = path.resolve(directory || process.env.DEOVR_LIST_PATH || '.');
    const initialPort = parseInt(options.port);

    // Add DELETE endpoint
    app.post('/api/remove-file', async (req, res) => {
      const filePath = req.query.path;
      if (!filePath) {
        return res.status(400).json({ error: 'No file path provided' });
      }

      try {
        const fullPath = path.join(absolutePath, decodeURIComponent(filePath));
        await moveFileToRemove(fullPath, absolutePath);
        res.json({ success: true });
      } catch (error) {
        console.error('Error moving file:', error);
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/api/restore-file', async (req, res) => {
      const filePath = req.query.path;
      if (!filePath) {
        return res.status(400).json({ error: 'No file path provided' });
      }

      try {
        const fullPath = path.join(absolutePath, decodeURIComponent(filePath));
        await restoreFileFromRemove(fullPath, absolutePath);
        res.json({ success: true });
      } catch (error) {
        console.error('Error restoring file:', error);
        res.status(500).json({ error: error.message });
      }
    });

    app.get('/deovr', (req, res) => {
      console.log('Received request to /deovr');
      res.json({
        "scenes":[
          {
            "name":"Library",
            "list":[
              {
                "title":"Play with a pretty dog",
                "videoLength":79,
                "thumbnailUrl":"https://deovr.com/s/images/feed/thumb1.png",
                "video_url":"https://deovr.com/deovr/video/id/1"
              },
              {
                "title":"Bikini car wash",
                "videoLength":242,
                "thumbnailUrl":"https://deovr.com/s/images/feed/thumb2.png",
                "video_url":"https://deovr.com/deovr/video/id/2"
              },
              {
                "title":"Date with a girl",
                "videoLength":401,
                "thumbnailUrl":"https:\/\/deovr.com\/s\/images\/feed\/thumb3.png",
                "video_url":"https://deovr.com/deovr/video/id/2"
              }
            ]
          }
        ]
      });
    });

    app.get('/api/files', (req, res) => {
      const requestedPath = req.query.path || '';
      const fullPath = path.join(absolutePath, requestedPath);
      const inRemoveFolder = requestedPath.split(path.sep).includes('remove');

      try {
        const items = fs.readdirSync(fullPath);
        const fileList = items.map(item => {
          const itemPath = path.join(fullPath, item);
          const stats = fs.statSync(itemPath);
          const relativePath = path.join(requestedPath, item);
          // Check both current path and file path for remove folder
          const isInRemoveFolder = inRemoveFolder || relativePath.split(path.sep).includes('remove');
          
          return {
            name: item,
            isDirectory: stats.isDirectory(),
            size: stats.size,
            path: path.join(requestedPath, encodeURIComponent(item)),
            actions: stats.isDirectory() ? [] : [{
              type: isInRemoveFolder ? 'restore' : 'delete',
              path: relativePath
            }]
          };
        });
        res.json(fileList);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.use(handleStaticFiles.bind(null, absolutePath));
    
    app.get('/:path(*)', async (req, res) => {
      const requestedPath = req.params.path || '';
      const fullPath = path.join(absolutePath, requestedPath);
      const inRemoveFolder = requestedPath.split(path.sep).includes('remove');
  
      try {
        const items = await Promise.all(fs.readdirSync(fullPath).map(async item => {
          const itemPath = path.join(fullPath, item);
          const stats = fs.statSync(itemPath);
          const isDirectory = stats.isDirectory();
          const relativePath = path.join(requestedPath, item);
          // Check both current path and file path for remove folder
          const isInRemoveFolder = inRemoveFolder || relativePath.split(path.sep).includes('remove');
          let duration = null;

          // Get video duration for video files
          if (!isDirectory && ['.mp4', '.m4v', '.webm'].includes(path.extname(item).toLowerCase())) {
            try {
              const metadata = await getVideoMetadata(itemPath);
              duration = metadata.duration;
            } catch (err) {
              console.error(`Error getting video metadata for ${item}:`, err);
            }
          }

          return {
            name: item,
            isDirectory: isDirectory,
            stats: {
              size: stats.size,
              mtime: stats.mtime
            },
            duration: duration,
            path: path.join(requestedPath, encodeURIComponent(item)),
            actions: isDirectory ? [] : [{
              type: isInRemoveFolder ? 'restore' : 'delete',
              path: relativePath
            }]
          };
        }));
    
        res.render('index', {
          items: items,
          currentPath: req.path
        });
      } catch (error) {
        res.status(500).render('error', {
          title: 'server error', 
          error: error,
          message: 'An error occurred while processing your request'
         });
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

app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
