const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const ffprobe = require('ffprobe');
const ffprobeStatic = require('ffprobe-static');
const { promiseWithTimeout } = require('./utils');

async function getVideoMetadata(filePath) {
  try {
    const data = await ffprobe(filePath, { path: ffprobeStatic.path });
    const videoStream = data.streams.find(stream => stream.codec_type === 'video');

    return {
      fileType: path.extname(filePath).substring(1),
      width: videoStream.width,
      height: videoStream.height,
      resolution: `${videoStream.width}x${videoStream.height}`,
      duration: Math.floor(parseFloat(videoStream.duration)),
      bitrate: videoStream.bit_rate,
      codec: videoStream.codec_name,
      fps: eval(videoStream.r_frame_rate)
    };
  } catch (error) {
    return {
      fileType: path.extname(filePath).substring(1),
      resolution: "unknown",
      duration: 0
    };
  }
}

async function getAdjacentMedia(dirPath, currentFile, timeoutMs = 10000) {
  const videoExtensions = ['.mp4', '.m4v', '.webm'];
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const mediaExtensions = [...videoExtensions, ...imageExtensions];

  try {
    // Use timeout for directory reading
    const files = await promiseWithTimeout(
      fs.readdir(dirPath),
      timeoutMs,
      `Timeout reading directory: ${dirPath}`
    );

    // Filter for media files
    const mediaFiles = files.filter(file =>
      mediaExtensions.includes(path.extname(file).toLowerCase())
    );

    const currentIndex = mediaFiles.indexOf(currentFile);
    return {
      previous: currentIndex > 0 ? encodeURIComponent(mediaFiles[currentIndex - 1]) : null,
      next: currentIndex < mediaFiles.length - 1 ? encodeURIComponent(mediaFiles[currentIndex + 1]) : null
    };
  } catch (error) {
    console.error(`Error getting adjacent media for ${dirPath}:`, error);
    // Return empty navigation if there's an error
    return {
      previous: null,
      next: null
    };
  }
}

function isDeoVRBrowser(userAgent) {
  return userAgent && (
    userAgent.toLowerCase().includes('deo vr')
  );
}

function isDeoVRPlayer(userAgent) {
  return userAgent && (
    userAgent.toLowerCase().includes('avpromobilevideo') ||
    userAgent.toLowerCase().includes('exoplayerlib')
  );
}

async function moveFileToRemove(filePath, absolutePath, timeoutMs = 10000) {
  const removePath = path.join(path.dirname(filePath), 'remove');
  const fileName = path.basename(filePath);
  const targetPath = path.join(removePath, fileName);

  try {
    // Check if remove directory exists
    try {
      await promiseWithTimeout(
        fs.access(removePath),
        timeoutMs / 2,
        `Timeout checking if directory exists: ${removePath}`
      );
    } catch (err) {
      // Create remove directory if it doesn't exist
      await promiseWithTimeout(
        fs.mkdir(removePath, { recursive: true }),
        timeoutMs,
        `Timeout creating directory: ${removePath}`
      );
    }

    // Move the file with timeout
    await promiseWithTimeout(
      fs.rename(filePath, targetPath),
      timeoutMs,
      `Timeout moving file: ${filePath} to ${targetPath}`
    );
  } catch (error) {
    console.error(`Error moving file to remove folder:`, error);
    throw error;
  }
}

async function restoreFileFromRemove(filePath, absolutePath, timeoutMs = 10000) {
  const parentPath = path.dirname(path.dirname(filePath)); // go up two levels: from remove/file.mp4 to get the parent
  const fileName = path.basename(filePath);
  const targetPath = path.join(parentPath, fileName);

  try {
    // Move the file back to parent directory with timeout
    await promiseWithTimeout(
      fs.rename(filePath, targetPath),
      timeoutMs,
      `Timeout restoring file: ${filePath} to ${targetPath}`
    );
  } catch (error) {
    console.error(`Error restoring file from remove folder:`, error);
    throw error;
  }
}

async function handleStaticFiles(absolutePath, req, res, next, timeoutMs = 10000) {
  const requestedPath = decodeURIComponent(req.path);
  const fullPath = path.join(absolutePath, requestedPath);
  console.log(req.headers['user-agent']);
  console.log(requestedPath.split('/').map(x => encodeURIComponent(x)).join('/'));

  try {
    if (req.query.json) {
      const fileFullPath = fullPath.replace(/\.json$/, '');

      // Get file stats with timeout
      let stats;
      try {
        stats = await promiseWithTimeout(
          fs.stat(fileFullPath),
          timeoutMs / 2,
          `Timeout getting stats for: ${fileFullPath}`
        );
      } catch (err) {
        if (err.message.includes('Timeout')) {
          return res.status(504).json({
            error: 'Timeout accessing file. The drive may be sleeping or disconnected.',
            path: requestedPath
          });
        }
        throw err;
      }

      // Get video metadata with timeout
      const videoMetadata = await promiseWithTimeout(
        getVideoMetadata(fileFullPath),
        timeoutMs,
        `Timeout getting video metadata for: ${fileFullPath}`
      ).catch(err => {
        console.error(`Error getting video metadata for ${fileFullPath}:`, err);
        return {
          fileType: path.extname(fileFullPath).substring(1),
          resolution: "unknown",
          duration: 0,
          width: 1920, // Default values
          height: 1080
        };
      });

      // Get adjacent media with timeout
      const dirPath = path.dirname(fileFullPath);
      const { previous, next } = await getAdjacentMedia(
        dirPath,
        path.basename(fileFullPath),
        timeoutMs
      );

      const deovrResponse = {
        title: path.basename(fullPath, path.extname(fileFullPath)),
        id: requestedPath,
        encodings: [{
          name: "h264",
          videoSources: [{
            resolution: videoMetadata.width,
            url: requestedPath.split('/').map(x => encodeURIComponent(x)).join('/'),
          }],
        }],
        is3d: true,
        // videoMetadata: {
        //   format: videoMetadata.fileType,
        //   resolution: videoMetadata.resolution,
        //   duration: videoMetadata.duration,
        //   bitrate: videoMetadata.bitrate,
        //   codec: videoMetadata.codec,
        //   fps: videoMetadata.fps
        // },
        navigation: {
          previousVideo: previous ? `${previous}` : null,
          nextVideo: next ? `${next}` : null
        }
      };
      console.log(deovrResponse);

      res.json(deovrResponse);
    } else {
      // Check if path exists and get stats with timeout
      let stats;
      try {
        stats = await promiseWithTimeout(
          fs.stat(fullPath),
          timeoutMs / 2,
          `Timeout getting stats for: ${fullPath}`
        );
      } catch (err) {
        if (err.message.includes('Timeout')) {
          return res.status(504).render('error', {
            title: 'Timeout Error',
            message: 'Timeout accessing file. The drive may be sleeping or disconnected.',
            error: err
          });
        }
        throw err;
      }

      if (stats.isDirectory()) {
        next();
      } else {
        // For files, we use Express's sendFile which handles streaming
        // This uses the synchronous fs by default, but that's okay for actual file serving
        res.sendFile(fullPath);
      }
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).render('error', {
        title: '404 Not Found',
        message: `The requested path "${requestedPath}" could not be found`,
        error: ''
      });
    }
    return res.status(500).render('error', {
      title: '500 Server Error',
      message: 'An internal server error occurred',
      error: error
    });
  }
}

async function getFileDetails(filePath, absolutePath, requestedPath, timeoutMs = 10000) {
  try {
    const fullPath = path.join(absolutePath, filePath);

    // Get file stats with timeout
    let stats;
    try {
      stats = await promiseWithTimeout(
        fs.stat(fullPath),
        timeoutMs / 2,
        `Timeout getting stats for: ${fullPath}`
      );
    } catch (err) {
      if (err.message.includes('Timeout')) {
        console.error(`Timeout getting stats for ${fullPath}`);
        // Return minimal info if timeout
        return {
          stats: {
            size: 0,
            mtime: new Date()
          },
          duration: null,
          error: 'timeout'
        };
      }
      throw err;
    }

    const isDirectory = stats.isDirectory();
    let duration = null;

    // Get video duration for video files
    if (!isDirectory && ['.mp4', '.m4v', '.webm'].includes(path.extname(filePath).toLowerCase())) {
      try {
        // Get video metadata with timeout
        const metadata = await promiseWithTimeout(
          getVideoMetadata(fullPath),
          timeoutMs,
          `Timeout getting video metadata for: ${fullPath}`
        );
        duration = metadata.duration;
      } catch (err) {
        console.error(`Error getting video metadata for ${filePath}:`, err);
      }
    }

    return {
      stats: {
        size: stats.size,
        mtime: stats.mtime
      },
      duration: duration
    };
  } catch (error) {
    console.error(`Error getting file details for ${filePath}:`, error);
    throw error;
  }
}

module.exports = {
    handleStaticFiles,
    getVideoMetadata,
    getAdjacentMedia,
    moveFileToRemove,
    restoreFileFromRemove,
    getFileDetails
};
