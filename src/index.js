#!/usr/bin/env node

const express = require('express');
const path = require('path');
const { program } = require('commander');
const { getVideoMetadata, handleStaticFiles, moveFileToRemove, restoreFileFromRemove, getFileDetails } = require('./fileHandler');
const favicon = require('serve-favicon');
const fs = require('fs').promises;
const fsSync = require('fs');
const Cache = require('./cache');
const { promiseWithTimeout } = require('./utils');

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
  .option('-t, --timeout <number>', 'Timeout in milliseconds for filesystem operations', process.env.DEOVR_FS_TIMEOUT || '10000')
  .action(async (directory, options) => {
    // Parse timeout option
    const fsTimeoutMs = parseInt(options.timeout);
    console.log(`Filesystem operation timeout set to ${fsTimeoutMs}ms`);
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

    // app.get('/deovr', (req, res) => {
    //   console.log('Received request to /deovr');
    //   res.json({
    //     "scenes":[
    //       {
    //         "name":"Library",
    //         "list":[
    //           {
    //             "title":"Play with a pretty dog",
    //             "videoLength":79,
    //             "video_url":"https://deovr.com/deovr/video/id/1"
    //           },
    //           {
    //             "title":"Bikini car wash",
    //             "videoLength":242,
    //             "video_url":"https://deovr.com/deovr/video/id/2"
    //           },
    //           {
    //             "title":"Date with a girl",
    //             "videoLength":401,
    //             "video_url":"https://deovr.com/deovr/video/id/2"
    //           }
    //         ]
    //       }
    //     ]
    //   });
    // });

    // API endpoint for getting file list with minimal data
    app.get('/api/files', async (req, res) => {
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
        // Use the safeFileOperation utility with timeout
        const { safeFileOperation } = require('./utils');

        // Read directory with timeout
        let items;
        try {
          items = await safeFileOperation(
            fs.readdir,
            [fullPath],
            fsTimeoutMs,
            `Timeout reading directory: ${fullPath}`
          );
        } catch (err) {
          if (err.isTimeout) {
            console.error(`Timeout reading directory: ${fullPath}`);
            return res.status(504).json({
              error: 'Timeout reading directory. The drive may be sleeping or disconnected.',
              path: requestedPath
            });
          }
          throw err;
        }

        // Process each file with timeout
        const fileListPromises = items.map(async item => {
          const itemPath = path.join(fullPath, item);
          const relativePath = path.join(requestedPath, item);
          // Check both current path and file path for remove folder
          const isInRemoveFolder = inRemoveFolder || relativePath.split(path.sep).includes('remove');

          let stats;
          try {
            // Get file stats with timeout
            stats = await safeFileOperation(
              fs.stat,
              [itemPath],
              fsTimeoutMs / 2, // Use shorter timeout for individual files
              `Timeout getting stats for: ${itemPath}`
            );
          } catch (err) {
            // If timeout or other error, return minimal info
            console.error(`Error getting stats for ${itemPath}:`, err.message);
            return {
              name: item,
              isDirectory: false, // Assume it's a file if we can't determine
              size: 0,
              path: path.join(requestedPath, encodeURIComponent(item)),
              error: err.isTimeout ? 'timeout' : 'error',
              actions: [{
                type: isInRemoveFolder ? 'restore' : 'delete',
                path: relativePath
              }]
            };
          }

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

        // Wait for all file stats to be processed, with overall timeout
        let fileList;
        try {
          fileList = await promiseWithTimeout(
            Promise.all(fileListPromises),
            fsTimeoutMs * 2, // Double timeout for the whole batch
            'Timeout processing file list'
          );
        } catch (err) {
          console.error('Error processing file list:', err.message);
          // Return partial results if available
          fileList = await Promise.allSettled(fileListPromises)
            .then(results => results
              .filter(r => r.status === 'fulfilled')
              .map(r => r.value)
            );

          if (fileList.length === 0) {
            return res.status(504).json({
              error: 'Timeout processing file list. The drive may be slow or disconnected.',
              path: requestedPath
            });
          }
          // Continue with partial results, but don't cache them
          return res.json(fileList);
        }

        // Store in cache
        fileListCache.set(cacheKey, fileList);

        // Add cache control headers
        res.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
        res.json(fileList);
      } catch (error) {
        console.error(`Error listing files in ${fullPath}:`, error);
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
        const details = await getFileDetails(filePath, absolutePath, req.query.path, fsTimeoutMs);

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

    // Pass the filesystem timeout to the handleStaticFiles middleware
    app.use((req, res, next) => handleStaticFiles(absolutePath, req, res, next, fsTimeoutMs));

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
          // If not in cache, read from filesystem with timeout
          const { safeFileOperation } = require('./utils');

          // Read directory with timeout
          let dirItems;
          try {
            dirItems = await safeFileOperation(
              fs.readdir,
              [fullPath],
              fsTimeoutMs,
              `Timeout reading directory: ${fullPath}`
            );
          } catch (err) {
            if (err.isTimeout) {
              console.error(`Timeout reading directory: ${fullPath}`);
              return res.status(504).render('error', {
                title: 'Timeout Error',
                message: 'Timeout reading directory. The drive may be sleeping or disconnected.',
                error: err
              });
            }
            throw err;
          }

          // Process each file with timeout
          const itemPromises = dirItems.map(async item => {
            const itemPath = path.join(fullPath, item);
            const relativePath = path.join(requestedPath, item);
            // Check both current path and file path for remove folder
            const isInRemoveFolder = inRemoveFolder || relativePath.split(path.sep).includes('remove');

            let stats;
            try {
              // Get file stats with timeout
              stats = await safeFileOperation(
                fs.stat,
                [itemPath],
                fsTimeoutMs / 2, // Use shorter timeout for individual files
                `Timeout getting stats for: ${itemPath}`
              );
            } catch (err) {
              console.error(`Error getting stats for ${itemPath}:`, err.message);
              // Return minimal info if we can't get stats
              return {
                name: item,
                isDirectory: false, // Assume it's a file if we can't determine
                stats: {
                  size: 0,
                  mtime: new Date()
                },
                duration: null,
                path: path.join(requestedPath, encodeURIComponent(item)),
                error: err.isTimeout ? 'timeout' : 'error',
                actions: [{
                  type: isInRemoveFolder ? 'restore' : 'delete',
                  path: relativePath
                }]
              };
            }

            const isDirectory = stats.isDirectory();
            let duration = null;

            // Get video duration for video files
            if (!isDirectory && ['.mp4', '.m4v', '.webm'].includes(path.extname(item).toLowerCase())) {
              try {
                // Use timeout for metadata extraction too
                const metadata = await promiseWithTimeout(
                  getVideoMetadata(itemPath),
                  fsTimeoutMs,
                  `Timeout getting video metadata for: ${itemPath}`
                );
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
          });

          // Wait for all file stats to be processed, with overall timeout
          try {
            items = await promiseWithTimeout(
              Promise.all(itemPromises),
              fsTimeoutMs * 2, // Double timeout for the whole batch
              'Timeout processing file list'
            );
          } catch (err) {
            console.error('Error processing file list:', err.message);
            // Return partial results if available
            items = await Promise.allSettled(itemPromises)
              .then(results => results
                .filter(r => r.status === 'fulfilled')
                .map(r => r.value)
              );

            if (items.length === 0) {
              return res.status(504).render('error', {
                title: 'Timeout Error',
                message: 'Timeout processing file list. The drive may be slow or disconnected.',
                error: err
              });
            }
            // Continue with partial results, but don't cache them
          }

          // Only store complete results in cache
          if (items.length === dirItems.length) {
            fileListCache.set(cacheKey, items);
          }
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
