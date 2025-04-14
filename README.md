## Features

- Automatic DeoVR browser detection
- Video metadata extraction (resolution, duration, codec, fps)
- Next/Previous video navigation
- Direct file serving for non-DeoVR clients
- Support for MP4, M4V and WebM formats
- In-memory file list caching for improved performance
- 3-hour HTML page caching for super fast navigation
- Auto-advancing random media cards

## Command Line Usage

Install globally to use the CLI:


npm install -g deovr-server


## CLI Options
- --port, -p: Set server port (default: 3000)
- --timeout, -t: Set filesystem operation timeout in milliseconds (default: 10000)
- Video directory path

Serve a video directory on port 3000:

deovr-server


Serve the video directory /media/videos on port 8080:

deovr-server -p 8080 /media/videos


Serve a directory with a longer timeout (30 seconds) for slow drives:

deovr-server -t 30000 /media/slow-drive/videos


## Environment Variables

The following environment variables can be used to configure the server instead of CLI arguments:

| Variable | Description | Default |
|----------|-------------|---------|
| DEOVR_LIST_PORT | Server port | 3000 |
| DEOVR_LIST_PATH | Video directory path | . |
| DEOVR_FS_TIMEOUT | Filesystem operation timeout in milliseconds | 10000 |

Environment variables take precedence over CLI arguments and config file settings. Example usage:

DEOVR_LIST_PORT=8080 DEOVR_LIST_PATH=/videos deovr-server

## Caching

The server implements several caching mechanisms to improve performance:

1. **In-memory file list cache**: File listings are cached in memory for 5 minutes to reduce filesystem operations.
2. **File details cache**: Metadata for files (size, duration, etc.) is cached for 1 hour.
3. **HTML page cache**: Rendered HTML pages are cached for 3 hours for super fast navigation.

Cache is automatically invalidated when files are modified (moved to/from the remove folder).

You can manually clear all caches by clicking the "Clear Cache" button in the UI or by making a POST request to `/api/clear-cache`.

## Handling Slow or Sleeping Drives

The server includes timeout handling for filesystem operations, which is particularly useful when working with:

- External hard drives that may be in sleep mode
- Network attached storage (NAS) with slow response times
- Drives with very large directories containing many video files

If a filesystem operation times out, the server will:

1. Return a user-friendly error message
2. Continue functioning for other requests
3. Attempt to provide partial results when possible

You can adjust the timeout duration using the `--timeout` command line option or the `DEOVR_FS_TIMEOUT` environment variable. The default timeout is 10 seconds (10000ms).

## API Endpoints

- `GET /api/files?path=<path>` - Get file list for a directory
- `GET /api/file-details?path=<path>` - Get detailed information about a file
- `POST /api/remove-file?path=<path>` - Move a file to the remove folder
- `POST /api/restore-file?path=<path>` - Restore a file from the remove folder
- `GET /api/cache-status` - Get information about the cache
- `POST /api/clear-cache` - Clear all caches