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
    version: '1.4.2', // Bump version to force update
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

const getNowPlaying = async (guideNumber) => {
    try {
        const discover = await axios.get(`http://${HDHOMERUN_IP}/discover.json`, { timeout: 1000 });
        const deviceAuth = discover.data.DeviceAuth;
        if (!deviceAuth) return null;

        const guideRes = await axios.get(`http://api.hdhomerun.com/api/guide?DeviceAuth=${deviceAuth}`, { timeout: 2000 });
        
        const channelData = guideRes.data.find(c => c.GuideNumber === guideNumber);
        if (!channelData || !channelData.Guide) return null;

        const now = Math.floor(Date.now() / 1000);
        const currentProg = channelData.Guide.find(p => now >= p.StartTime && now < p.EndTime);
        return currentProg ? currentProg.Title : null;
    } catch (e) {
        if (DEBUG) console.log(`[EPG] Error fetching guide: ${e.message}`);
        return null;
    }
};

const builder = new addonBuilder(MANIFEST);

// 1. Catalog Handler
builder.defineCatalogHandler(async ({ type, id }) => {
    if (DEBUG) console.log(`[CATALOG] Request for ${type} / ${id}`);
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
    } catch (e) {
        return { metas: [] };
    }
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
            behaviorHints: { 
                isLive: true,
                defaultVideoId: id 
            }
        }
    };
});

// 3. Stream Handler (Updated for HLS)
builder.defineStreamHandler(async ({ type, id }) => {
    if (DEBUG) console.log(`[STREAM] Request for ${type} / ${id}`);
    if ((type !== 'tv' && type !== 'channel') || !id.startsWith('hdhr_')) return { streams: [] };

    const guideNum = id.replace('hdhr_', '');
    const rawUrl = `http://${HDHOMERUN_IP}:5004/auto/v${guideNum}`;
    
    // CHANGE: Use HLS manifest endpoint instead of raw stream
    // This forces Mediaflow to wrap the MPEG2/HEVC stream in an HLS container
    const hlsUrl = `${MEDIAFLOW_URL}/proxy/hls/manifest.m3u8?d=${encodeURIComponent(rawUrl)}&api_password=${encodeURIComponent(MEDIAFLOW_PASS)}`;
    
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
                url: `${EXTERNAL_URL}/assets/fallback_icon.png`
            };
        }
    } catch (e) {
        techInfoStream = {
            name: "ℹ️ DEVICE INFO",
            title: "Unavailable - Could not reach HDHomeRun API",
            url: `${EXTERNAL_URL}/assets/fallback_icon.png`
        };
    }

    const streams = [
        { 
            title: '🌀 Mediaflow (HLS)', 
            url: hlsUrl,
            behaviorHints: { 
                notWebReady: false, 
                bingeGroup: "tv" 
            }
        },
        { 
            title: '📡 Direct (Raw)', 
            url: rawUrl, 
            behaviorHints: { notWebReady: true } 
        }
    ];
    if (techInfoStream) streams.push(techInfoStream);

    return { streams };
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
    const githubUrl = `https://raw.githubusercontent.com/tv-logos/tv-logos/main/countries/united-states/${cleanName}.png`;
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
        res.status(200).send('OK');
    } catch (e) { res.status(503).send('Unreachable'); }
});

app.listen(PORT, () => console.log(`Addon active on port ${PORT} (Debug: ${DEBUG})`));
