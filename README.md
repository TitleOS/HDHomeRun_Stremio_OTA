# HDHomeRun Stremio Addon

A Stremio addon that imports your local OTA (Over-the-Air) channels from an HDHomeRun OTA Tuner such as a **HDHomeRun Connect 4K** directly into the Stremio interface.

![Version](https://img.shields.io/badge/version-1.0.0-blue) ![Docker](https://img.shields.io/badge/docker-automated-green)

## 📺 Features

* **Live TV Catalog:** Adds a "HDHomerun" row to your Stremio Board.
* **Live Metadata:** Displays "Now Playing" information on channel posters (fetched from `discover.json`).
* **Transcoding Support:** Routes streams through a [Mediaflow Proxy](https://github.com/mhadzic/mediaflow-proxy) to handle ATSC 3.0 (AC-4 audio) and improve compatibility with Stremio players (ExoPlayer/VLC).
* **Fast Zapping:** Lightweight Node.js backend designed for local network speed.

## Installation

### Option 1: Docker Compose (Recommended)
Add this service to your existing stack or create a new `docker-compose.yml`:

```yaml
services:
  hdhomerun-stremio:
    image: titleos/hdhomerun-stremio:latest
    container_name: hdhomerun-stremio
    restart: always
    environment:
      - HDHOMERUN_IP=192.168.1.100       # Your HDHomeRun LAN IP
      - MEDIAFLOW_URL=[http://192.168.1.50:8888](http://192.168.1.50:8888)  # Your Mediaflow Proxy URL
      - MEDIAFLOW_PASS=your_password     # Your Mediaflow API Password
      - PORT=7000                        # Internal container port
    ports:
      - "7000:7000"

```

### Option 2: Docker CLI

```bash
docker run -d \
  --name=hdhomerun-stremio \
  --restart=always \
  -e HDHOMERUN_IP=192.168.1.100 \
  -e MEDIAFLOW_URL=[http://192.168.1.50:8888](http://192.168.1.50:8888) \
  -e MEDIAFLOW_PASS=your_password \
  -p 7000:7000 \
  titleos/hdhomerun-stremio:latest

```

## Configuration

| Variable | Description | Default |
| :--- | :--- | :--- |
| `HDHOMERUN_IP` | The local IP address of your HDHomeRun tuner. | `192.168.1.100` |
| `EXTERNAL_URL` | The URL used to reach this addon (used for logo proxying). | `http://stremioota.lan` |
| `MEDIAFLOW_URL` | The full URL to your Mediaflow Proxy instance. | `http://localhost:8888` |
| `MEDIAFLOW_PASS` | The API password configured in Mediaflow. | `(Empty)` |
| `PORT` | The port the addon listens on. | `7000` |

## LAN Environment Setup

In a local network (LAN) setup, especially when using a custom domain like `.lan` or `.local`, you must define the `EXTERNAL_URL` so Stremio knows where to fetch the channel logos and the fallback placeholder.

## Connecting to Stremio

1. Ensure the container is running and accessible.
2. Open Stremio on your device.
3. In the search bar (or Addon URL field), enter:
```
http://YOUR_SERVER_IP:7000/manifest.json

```


4. Click **Install**.

> **Tip:** You can use [Stremio Addon Manager](https://stremio-addon-manager.vercel.app/) or **AIOStreams** to reorder your catalogs, moving "HDHomerun" to the top of your board for easy access.

## Local Development

If you want to modify the code or run it without Docker:

```bash
# Clone the repo
git clone [https://github.com/TitleOS/hdhomerun-stremio.git](https://github.com/TitleOS/hdhomerun-stremio.git)

# Install dependencies
npm install

# Run (ensure environment variables are set)
node addon.js

```

## License

Mozilla Public License 2.0 MPL-2.0 - Created by **TitleOS**
