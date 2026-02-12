# HDHomeRun_Stremio_OTA
A Stremio addon that exposes your local OTA channels provided by a HDHomeRun tuner as Live TV channels in Stremio.

This addon will expose a new catalog named "HDHomerun" that will expose an entity for each OTA channel being recieved.

While unrelated to this project, you can use Stremio Addon Manager (https://stremio-addon-manager.vercel.app/) or AIOStreams to rearrange the catalog rows order, allowing you to move the HDHomerun row up or down as wanted.



## Environment Variables (Required):
HDHOMERUN_IP=192.168.1.100 (Set to the LAN IP of your HDHomeRun OTA Tuner)

MEDIAFLOW_URL=http://192.168.1.50:8888 (Set to the public URL of your Mediaflow Proxy)

MEDIAFLOW_PASS=your_password (Your Mediaflow API Password)

PORT=7000 (The port where this addon will be hosted)
