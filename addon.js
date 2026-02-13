const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const express = require('express');
const axios = require('axios');
const path = require('path');

// --- Configuration ---
const HDHOMERUN_IP = process.env.HDHOMERUN_IP || '192.168.1.100';
const MEDIAFLOW_URL = process.env.MEDIAFLOW_URL || 'http://localhost:8888';
const MEDIAFLOW_PASS = process.env.MEDIAFLOW_PASS || '';
const EXTERNAL_URL = process.env.EXTERNAL_URL || 'http://stremioota.lan';
const PORT = process.env.PORT || 7000;
const DEBUG = process.env.DEBUG_LOGGING === 'true';

const MANIFEST = {
    id: 'org.titleos.hdhomerun',
    version: '1.1.0', // Bump version
    name: 'HDHomerun Live',
    description: `OTA via ${HDHOMERUN_IP}`,
    resources: ['catalog', 'meta', 'stream'],
    types: ['channel', 'tv'], 
    catalogs: [{ type: 'channel', id: 'hdhr_ota', name: 'HDHomerun' }],
    idPrefixes: ['hdhr_']
};

const getAssetUrl = (guideName) => {
    const cleanName = guideName.replace(/[-\s]?(DT|HD|LD)\d*$/i, '').replace(/\s+/g, '');
    return `${EXTERNAL_URL}/assets/${encodeURIComponent(cleanName)}.png`;
};

// --- EPG Logic ---
const getNowPlaying = async (guideNumber) => {
    try {
        // 1. Get Device Auth
        const discover = await axios.get(`http://${HDHOMERUN_IP}/discover.json`, { timeout: 1000 });
        const deviceAuth = discover.data.DeviceAuth;
        if (!deviceAuth) {
            if (DEBUG) console.log(`[EPG] No DeviceAuth found in discover.json`);
            return null;
        }

        // 2. Fetch Guide
        const guideRes = await axios.get(`http://api.hdhomerun.com/api/guide?DeviceAuth=${deviceAuth}`, { timeout: 2000 });
        
        // 3. Find Channel
        const channelData = guideRes.data.find(c => c.GuideNumber === guideNumber);
        if (!channelData || !channelData.Guide) {
            if (DEBUG) console.log(`[EPG] No guide data found for Channel ${guideNumber}`);
            return null;
        }

        // 4. Find Program
        const now = Math.floor(Date.now() / 1000); // Current time in seconds
        const currentProg = channelData.Guide.find(p => now >= p.StartTime && now < p.EndTime);
        
        if (currentProg && DEBUG) console.log(`[EPG] Ch ${guideNumber} is playing: ${currentProg.Title}`);
        
        return currentProg ? currentProg.Title : null;
    } catch (e) {
        if (DEBUG) console.log(`[EPG] Error: ${e.message}`);
        return null;
    }
};

const builder = new addonBuilder(MANIFEST);

// 1. Catalog Handler
builder.defineCatalogHandler(async ({ type, id }) => {
    if (type !== 'tv' && type !== 'channel') return { metas: [] };

    try {
        const res = await axios.get(`http://${HDHOMERUN_IP}/lineup.json`, { timeout: 3000 });
        const metas = res.data.map(c => ({
            id: `hdhr_${c.GuideNumber}`,
            type: type,
            name: c.GuideName,
            poster: getAssetUrl(c.GuideName),
            logo: getAssetUrl(c.GuideName),
            description: `Channel ${c.GuideNumber}`
        }));
        return { metas };
    } catch (e) { return { metas: [] }; }
});

// 2. Meta Handler
builder.defineMetaHandler(async ({ type, id }) => {
    if ((type !== 'tv' && type !== 'channel') || !id.startsWith('hdhr_')) return { meta: null };
    const guideNum = id.replace('hdhr_', '');
    
    let guideName = `Channel ${guideNum}`;
    try {
        const res = await axios.get(`http://${HDHOMERUN_IP}/lineup.json`, { timeout: 1500 });
        const channel = res.data.find(c => c.GuideNumber === guideNum);
        if (channel) guideName = channel.GuideName;
    } catch (e) {}

    // Try to get EPG for description (might be cached by Stremio)
    let description = `Live on ${guideName}`;
    const nowPlaying = await getNowPlaying(guideNum);
    if (nowPlaying) description = `Live on ${nowPlaying}`;

    return {
        meta: {
            id: id,
            type: type,
            name: guideName,
            poster: getAssetUrl(guideName),
            logo: getAssetUrl(guideName),
            background: getAssetUrl(guideName),
            description: description,
            runtime: "LIVE",
            behaviorHints: { isLive: true, defaultVideoId: id }
        }
    };
});

// 3. Stream Handler (Updated with EPG in Title)
builder.defineStreamHandler(async ({ type, id }) => {
    if ((type !== 'tv' && type !== 'channel') || !id.startsWith('hdhr_')) return { streams: [] };

    const guideNum = id.replace('hdhr_', '');
    const rawUrl = `http://${HDHOMERUN_IP}:5004/auto/v${guideNum}`;
    const hlsUrl = `${MEDIAFLOW_URL}/proxy/hls/manifest.m3u8?d=${encodeURIComponent(rawUrl)}&api_password=${encodeURIComponent(MEDIAFLOW_PASS)}`;
    
    // Fetch EPG immediately for the Stream Title
    const nowPlaying = await getNowPlaying(guideNum);
    const showTitle = nowPlaying ? `(${nowPlaying})` : '(Live)';

    // Tech Info
    let techInfoStream = null;
    try {
        const [discoverRes, lineupRes] = await Promise.all([
            axios.get(`http://${HDHOMERUN_IP}/discover.json`, { timeout: 1500 }),
            axios.get(`http://${HDHOMERUN_IP}/lineup.json`, { timeout: 1500 })
        ]);
        const tuner = discoverRes.data;
        const channel = lineupRes.data.find(c => c.GuideNumber === guideNum);

        if (channel) {
            const tunerStr = `${tuner.FriendlyName} (${tuner.ModelNumber}) FW:${tuner.FirmwareVersion}`;
            const signalStr = `Signal: ${channel.SignalStrength}% / Qual: ${channel.SignalQuality}%`;
            const codecStr = `${channel.VideoCodec}/${channel.AudioCodec}`;
            const hdStr = channel.HD === 1 ? 'HD' : 'SD';

            techInfoStream = {
                name: "ℹ️ DEVICE INFO",
                title: `${tunerStr}\n${signalStr}\n${codecStr} (${hdStr})`,
                url: `${EXTERNAL_URL}/assets/hdhomerun_icon.png`
            };
        }
    } catch (e) {
        techInfoStream = {
            name: "ℹ️ DEVICE INFO",
            title: "Unavailable - Could not reach HDHomeRun API",
            url: `${EXTERNAL_URL}/assets/hdhomerun_icon.png`
        };
    }

    return {
        streams: [
            { 
                // Displays: "🌀 Mediaflow (The Price Is Right)"
                title: `🌀 Mediaflow ${showTitle}`, 
                url: hlsUrl,
                behaviorHints: { notWebReady: false, bingeGroup: "tv" } 
            },
            { 
                title: `📡 Direct ${showTitle}`, 
                url: rawUrl, 
                behaviorHints: { notWebReady: true } 
            },
            ...(techInfoStream ? [techInfoStream] : [])
        ]
    };
});

// --- Server Setup ---
const app = express();
const addonInterface = builder.getInterface();
const addonRouter = getRouter(addonInterface);

if (DEBUG) app.use((req, res, next) => { console.log(`[HTTP] ${req.method} ${req.url}`); next(); });
app.use('/', addonRouter);

app.get('/assets/:filename', async (req, res) => {
    const rawName = req.params.filename.replace('.png', '');
    const cleanName = decodeURIComponent(rawName);
    //const githubUrl = `https://raw.githubusercontent.com/tv-logos/tv-logos/main/countries/united-states/us-local/${cleanName}.png`;
    const uiAvatarsUrl = `https://ui-avatars.com/api/?name=${cleanName}&background=random&color=fff&size=512&font-size=0.5&bold=true`;

    try {
        await axios.head(githubUrl, { timeout: 1500 });
        res.redirect(githubUrl);
    } catch (e1) {
        try {
            res.redirect(uiAvatarsUrl);
        } catch (e2) {
            res.sendFile(path.join(__dirname, 'fallback_icon.png'));
        }
    }
});

app.get('/health', async (req, res) => {
    try {
        await axios.get(`http://${HDHOMERUN_IP}/discover.json`, { timeout: 1500 });
        res.status(200).send(`HDHomerun available at ${HDHOMERUN_IP}`);
    } catch (e) { res.status(503).send('Unreachable'); }
});

app.listen(PORT, () => console.log(`Addon active on port ${PORT} (Debug: ${DEBUG})`));
