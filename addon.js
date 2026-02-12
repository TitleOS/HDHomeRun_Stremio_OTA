const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const http = require('http');

const HDHOMERUN_IP = process.env.HDHOMERUN_IP || '192.168.1.100';
const MEDIAFLOW_URL = process.env.MEDIAFLOW_URL || 'http://localhost:8888';
const MEDIAFLOW_PASS = process.env.MEDIAFLOW_PASS || '';
const PORT = process.env.PORT || 7000;

const MANIFEST = {
    id: 'org.titleos.hdhomerun',
    version: '1.0.0',
    name: 'HDHomerun Live TV',
    description: `OTA via ${HDHOMERUN_IP}`,
    resources: ['catalog', 'meta', 'stream'],
    types: ['tv'],
    catalogs: [{ type: 'tv', id: 'hdhr_ota', name: 'HDHomerun' }],
    idPrefixes: ['hdhr_']
};

const builder = new addonBuilder(MANIFEST);

// --- Handlers ---
builder.defineCatalogHandler(async () => {
    try {
        const res = await axios.get(`http://${HDHOMERUN_IP}/lineup.json`, { timeout: 2000 });
        const metas = res.data.map(c => ({
            id: `hdhr_${c.GuideNumber}`,
            type: 'tv',
            name: c.GuideName,
            poster: `https://logo.clearqam.net/l/${c.GuideNumber}.png`,
            description: `Channel ${c.GuideNumber}`
        }));
        return { metas };
    } catch (e) { return { metas: [] }; }
});

builder.defineMetaHandler(async ({ id }) => {
    const guideNum = id.replace('hdhr_', '');
    return {
        meta: {
            id,
            type: 'tv',
            name: `Channel ${guideNum}`,
            poster: `https://logo.clearqam.net/l/${guideNum}.png`,
            logo: `https://logo.clearqam.net/l/${guideNum}.png`
        }
    };
});

builder.defineStreamHandler(async ({ id }) => {
    const guideNum = id.replace('hdhr_', '');
    const rawUrl = `http://${HDHOMERUN_IP}:5004/auto/v${guideNum}`;
    const proxiedUrl = `${MEDIAFLOW_URL}/proxy/stream?d=${encodeURIComponent(rawUrl)}&api_password=${MEDIAFLOW_PASS}`;
    return {
        streams: [
            { title: '🌀 Mediaflow Proxy', url: proxiedUrl },
            { title: '📡 Direct HDHomerun', url: rawUrl }
        ]
    };
});

// --- Health Check & Server ---
const addonInterface = builder.getInterface();
const server = serveHTTP(addonInterface, { port: PORT });

// Add a custom health check endpoint to the existing server
server.get('/health', async (req, res) => {
    try {
        // Check if HDHomerun is responding
        await axios.get(`http://${HDHOMERUN_IP}/discover.json`, { timeout: 1500 });
        res.status(200).send('OK');
    } catch (e) {
        res.status(503).send('HDHomerun Unreachable');
    }
});

console.log(`Addon running on port ${PORT}. Health check at /health`);