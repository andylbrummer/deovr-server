const path = require('path');
const fs = require('fs');
const ffprobe = require('ffprobe');
const ffprobeStatic = require('ffprobe-static');

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

function getAdjacentVideos(dirPath, currentFile) {
  const files = fs.readdirSync(dirPath)
    .filter(file => ['.mp4', '.m4v', '.webm'].includes(path.extname(file)));

  const currentIndex = files.indexOf(currentFile);
  return {
    previous: currentIndex > 0 ? encodeURIComponent(files[currentIndex - 1]) : null,
    next: currentIndex < files.length - 1 ? encodeURIComponent(files[currentIndex + 1]) : null
  };
}

function isDeoVRBrowser(userAgent) {
  return userAgent && (
    userAgent.includes('Deo VR') ||
    userAgent.includes('Deo VR') ||
    userAgent.includes('deo vr')
  );
}

function isDeoVRPlayer(userAgent) {
  return userAgent && (
    userAgent.includes('AVProMobileVideo') || userAgent.includes('ExoPlayerLib')
  );
}

async function handleStaticFiles(absolutePath, req, res, next) {
  const requestedPath = decodeURIComponent(req.path);
  const fullPath = path.join(absolutePath, requestedPath);
  console.log(req.headers['user-agent']);
  console.log(requestedPath.split('/').map(x => encodeURIComponent(x)).join('/'));

  try {
    const stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
      next();
    } else {
      if (req.query.json) {
        const videoMetadata = await getVideoMetadata(fullPath);
        const dirPath = path.dirname(fullPath);
        const { previous, next } = getAdjacentVideos(dirPath, path.basename(fullPath));

        const deovrResponse = {
          title: path.basename(fullPath, path.extname(fullPath)),
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

module.exports = handleStaticFiles;
