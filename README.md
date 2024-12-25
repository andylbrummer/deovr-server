## Features

- Automatic DeoVR browser detection
- Video metadata extraction (resolution, duration, codec, fps)
- Next/Previous video navigation
- Direct file serving for non-DeoVR clients
- Support for MP4, M4V and WebM formats

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

Environment variables take precedence over CLI arguments and config file settings.Example usage:

DEOVR_LIST_PORT=8080 DEOVR_LIST_PATH=/videos deovr-server