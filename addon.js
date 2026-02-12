const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const express = require('express');
const axios = require('axios');
const path = require('path');

// --- Configuration ---
const HDHOMERUN_IP = process.env.HDHOMERUN_IP || '192.168.1.100';
const MEDIAFLOW_URL = process.env.MEDIAFLOW_URL || 'http://localhost:8888';
const MEDIAFLOW_PASS = process.env.MEDIAFLOW_PASS || '';
const EXTERNAL_URL = process.env.EXTERNAL_URL || 'http://stremioota.lcars.lan';
const PORT = process.env.PORT || 7000;
const DEBUG = process.env.DEBUG_LOGGING === 'true';

const MANIFEST = {
    id: 'org.titleos.hdhomerun',
    version: '1.2.3',
    name: 'HDHomerun Live',
    description: `OTA via ${HDHOMERUN_IP}`,
    resources: ['catalog', 'meta', 'stream'],
    types: ['tv'],
    catalogs: [{ type: 'tv', id: 'hdhr_ota', name: 'HDHomerun' }],
    idPrefixes: ['hdhr_']
};

// Helper: Logo URL generator
const getAssetUrl = (guideNum) => `${EXTERNAL_URL}/assets/L${guideNum}.png`;

const builder = new addonBuilder(MANIFEST);

// 1. Catalog Handler
builder.defineCatalogHandler(async ({ type, id }) => {
    if (DEBUG) console.log(`[CATALOG] Request for ${type} / ${id}`);
    
    try {
        const res = await axios.get(`http://${HDHOMERUN_IP}/lineup.json`, { timeout: 3000 });
        const metas = res.data.map(c => ({
            id: `hdhr_${c.GuideNumber}`,
            type: 'tv',
            name: c.GuideName,
            poster: getAssetUrl(c.GuideNumber),
            logo: getAssetUrl(c.GuideNumber),
            description: `Live on ${c.GuideName}`
        }));
        if (DEBUG) console.log(`[CATALOG] Returning ${metas.length} channels`);
        return { metas };
    } catch (e) {
        console.error(`[ERROR] Catalog fetch failed: ${e.message}`);
        return { metas: [] };
    }
});

// 2. Meta Handler
builder.defineMetaHandler(async ({ type, id }) => {
    if (DEBUG) console.log(`[META] Request for ${type} / ${id}`);
    
    if (type !== 'tv' || !id.startsWith('hdhr_')) return { meta: null };
    const guideNum = id.replace('hdhr_', '');
    
    return {
        meta: {
            id: id,
            type: 'tv',
            name: `Channel ${guideNum}`,
            poster: getAssetUrl(guideNum),
            logo: getAssetUrl(guideNum),
            background: getAssetUrl(guideNum),
            description: `Live OTA Broadcast from HDHomerun Tuner.`,
            runtime: "LIVE",
            behaviorHints: { isLive: true }
        }
    };
});

// 3. Stream Handler
builder.defineStreamHandler(async ({ type, id }) => {
    if (DEBUG) console.log(`[STREAM] Request for ${type} / ${id}`);
    
    if (type !== 'tv' || !id.startsWith('hdhr_')) return { streams: [] };
    const guideNum = id.replace('hdhr_', '');
    const rawUrl = `http://${HDHOMERUN_IP}:5004/auto/v${guideNum}`;
    const proxiedUrl = `${MEDIAFLOW_URL}/proxy/stream?d=${encodeURIComponent(rawUrl)}&api_password=${encodeURIComponent(MEDIAFLOW_PASS)}`;

    return {
        streams: [
            { title: '🌀 Mediaflow Proxy', url: proxiedUrl, behaviorHints: { notWebReady: false } },
            { title: '📡 Direct HDHomerun', url: rawUrl, behaviorHints: { notWebReady: true } }
        ]
    };
});

// --- Server Setup ---
const app = express();
const addonInterface = builder.getInterface();
const addonRouter = getRouter(addonInterface);

// DEBUG MIDDLEWARE: Prints every incoming request
if (DEBUG) {
    app.use((req, res, next) => {
        console.log(`[HTTP] ${req.method} ${req.url}`);
        next();
    });
}

app.use('/', addonRouter);

// Asset Route with Debugging
app.get('/assets/:filename', async (req, res) => {
    const logoUrl = `http://${HDHOMERUN_IP}/images/${req.params.filename}`;
    if (DEBUG) console.log(`[ASSET] Fetching ${req.params.filename} from ${logoUrl}`);

    try {
        await axios.get(logoUrl, { timeout: 2000, headers: { 'Range': 'bytes=0-0' } });
        res.redirect(logoUrl);
    } catch (e) {
        if (DEBUG) console.log(`[ASSET] Failed to find ${req.params.filename}. Serving placeholder.`);
        res.sendFile(path.join(__dirname, 'placeholder.png'));
    }
});

app.get('/health', async (req, res) => {
    try {
        await axios.get(`http://${HDHOMERUN_IP}/discover.json`, { timeout: 1500 });
        res.status(200).send('OK');
    } catch (e) { res.status(503).send('Unreachable'); }
});

app.listen(PORT, () => console.log(`Addon active on port ${PORT} (Debug: ${DEBUG})`));
