#!/usr/bin/env node

const express = require('express');
const path = require('path');
const { program } = require('commander');
const { getVideoMetadata, handleStaticFiles, moveFileToRemove, restoreFileFromRemove, getFileDetails } = require('./fileHandler');
const favicon = require('serve-favicon');
const fs = require('fs');
const Cache = require('./cache');

const app = express();

// Initialize caches
const fileListCache = new Cache(5 * 60 * 1000); // 5 minutes TTL for file lists
const fileDetailsCache = new Cache(60 * 60 * 1000); // 1 hour TTL for file details
const htmlPageCache = new Cache(3 * 60 * 60 * 1000); // 3 hours TTL for HTML pages

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

        // Invalidate caches when files are modified
        const dirPath = path.dirname(filePath);
        fileListCache.delete(dirPath);
        htmlPageCache.delete(dirPath);

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

        // Invalidate caches when files are modified
        const dirPath = path.dirname(path.dirname(filePath)); // parent directory of 'remove' folder
        fileListCache.delete(dirPath);
        htmlPageCache.delete(dirPath);

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

    // API endpoint for getting file list with minimal data
    app.get('/api/files', (req, res) => {
      const requestedPath = req.query.path || '';
      const fullPath = path.join(absolutePath, requestedPath);
      const inRemoveFolder = requestedPath.split(path.sep).includes('remove');

      // Check cache first
      const cacheKey = requestedPath;
      const cachedFileList = fileListCache.get(cacheKey);

      if (cachedFileList) {
        // Add cache control headers
        res.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
        return res.json(cachedFileList);
      }

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

        // Store in cache
        fileListCache.set(cacheKey, fileList);

        // Add cache control headers
        res.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
        res.json(fileList);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // API endpoint for getting detailed file information
    app.get('/api/file-details', async (req, res) => {
      const filePath = req.query.path;
      if (!filePath) {
        return res.status(400).json({ error: 'No file path provided' });
      }

      // Check cache first
      const cacheKey = filePath;
      const cachedDetails = fileDetailsCache.get(cacheKey);

      if (cachedDetails) {
        // Add cache control headers
        res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        return res.json(cachedDetails);
      }

      try {
        const details = await getFileDetails(filePath, absolutePath, req.query.path);

        // Store in cache
        fileDetailsCache.set(cacheKey, details);

        // Add cache control headers - cache file details longer since they rarely change
        res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        res.json(details);
      } catch (error) {
        console.error('Error getting file details:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // API endpoint for cache status
    app.get('/api/cache-status', (req, res) => {
      const status = {
        fileList: fileListCache.getStats(),
        fileDetails: fileDetailsCache.getStats(),
        htmlPage: htmlPageCache.getStats()
      };
      res.json(status);
    });

    // API endpoint to clear cache
    app.post('/api/clear-cache', (req, res) => {
      fileListCache.clear();
      fileDetailsCache.clear();
      htmlPageCache.clear();
      res.json({ success: true, message: 'All caches cleared' });
    });

    app.use(handleStaticFiles.bind(null, absolutePath));

    app.get('/:path(*)', async (req, res) => {
      const requestedPath = req.params.path || '';
      const fullPath = path.join(absolutePath, requestedPath);
      const inRemoveFolder = requestedPath.split(path.sep).includes('remove');

      // Create a cache key based on the requested path
      const cacheKey = requestedPath;

      // Check if we have a cached HTML response
      const cachedHtml = htmlPageCache.get(cacheKey);
      if (cachedHtml) {
        // Set cache control headers for HTML response
        res.set('Cache-Control', 'public, max-age=10800'); // Cache for 3 hours
        return res.send(cachedHtml);
      }

      try {
        // Check if we have cached file list data
        let items = fileListCache.get(cacheKey);

        if (!items) {
          // If not in cache, read from filesystem
          items = await Promise.all(fs.readdirSync(fullPath).map(async item => {
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

          // Store the file list in cache
          fileListCache.set(cacheKey, items);
        }

        // Render the page
        res.set('Cache-Control', 'public, max-age=10800'); // Cache for 3 hours

        // Use a custom response object to capture the rendered HTML
        const renderResponse = {
          send: function(html) {
            // Store the rendered HTML in cache
            htmlPageCache.set(cacheKey, html);
            // Send the response to the client
            res.send(html);
          }
        };

        // Render the template and capture the output
        app.render('index', {
          items: items,
          currentPath: req.path
        }, (err, html) => {
          if (err) {
            return res.status(500).render('error', {
              title: 'server error',
              error: err,
              message: 'An error occurred while rendering the page'
            });
          }

          // Store the rendered HTML in cache and send response
          htmlPageCache.set(cacheKey, html);
          res.send(html);
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
