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
- Video directory path

Serve a video directory on port 3000:

deovr-server


Serve the video directory /media/videos on port 8080:

deovr-server -p 8080 /media/videos


## Environment Variables

The following environment variables can be used to configure the server instead of CLI arguments:

| Variable | Description | Default |
|----------|-------------|---------|
| DEOVR_LIST_PORT | Server port | 3000 |
| DEOVR_LIST_PATH | Video directory path | . |

Environment variables take precedence over CLI arguments and config file settings. Example usage:

DEOVR_LIST_PORT=8080 DEOVR_LIST_PATH=/videos deovr-server

## Caching

The server implements several caching mechanisms to improve performance:

1. **In-memory file list cache**: File listings are cached in memory for 5 minutes to reduce filesystem operations.
2. **File details cache**: Metadata for files (size, duration, etc.) is cached for 1 hour.
3. **HTML page cache**: Rendered HTML pages are cached for 3 hours for super fast navigation.

Cache is automatically invalidated when files are modified (moved to/from the remove folder).

You can manually clear all caches by clicking the "Clear Cache" button in the UI or by making a POST request to `/api/clear-cache`.

## API Endpoints

- `GET /api/files?path=<path>` - Get file list for a directory
- `GET /api/file-details?path=<path>` - Get detailed information about a file
- `POST /api/remove-file?path=<path>` - Move a file to the remove folder
- `POST /api/restore-file?path=<path>` - Restore a file from the remove folder
- `GET /api/cache-status` - Get information about the cache
- `POST /api/clear-cache` - Clear all caches