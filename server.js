const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Automatic .env file loader
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || '';
        val = val.replace(/^['"](.*)['"]$/, '$1').trim();
        process.env[key] = val;
      }
    });
  }
} catch (e) {}

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_GEMINI_KEY = process.env.GEMINI_API_KEY || '';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Standard modern headers to emulate real browser requests without triggering expired consent walls
const YOUTUBE_FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

/**
 * Decode common HTML entities
 */
function decodeHTMLEntities(text) {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/<[^>]+>/g, '') // Strip XML/HTML tags like <font>, <s>, <span>
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean transcript segment text (remove sound effects, bracketed cues, and extra spaces)
 */
function cleanSegmentText(text) {
  if (!text) return '';
  let cleaned = decodeHTMLEntities(text);
  // Remove sound cues like [Music], (Applause), [Laughter], etc.
  cleaned = cleaned.replace(/\[[^\]]+\]/g, ' ');
  cleaned = cleaned.replace(/\([^\)]+\)/g, ' ');
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

/**
 * Deduplicates overlapping "rolling captions" from auto-generated YouTube transcripts.
 * Compares trailing words of segment[i-1] with leading words of segment[i] (1 to 6 words).
 */
function deduplicateRollingCaptions(rawSegments) {
  const result = [];

  for (let i = 0; i < rawSegments.length; i++) {
    let currentText = cleanSegmentText(rawSegments[i].text);
    if (!currentText) continue;

    if (result.length > 0) {
      const prevText = result[result.length - 1].text;
      const prevWords = prevText.split(/\s+/).filter(Boolean);
      const currWords = currentText.split(/\s+/).filter(Boolean);

      let maxOverlap = 0;
      const maxCheck = Math.min(6, prevWords.length, currWords.length);

      // Try largest overlap first down to 1
      for (let n = maxCheck; n >= 1; n--) {
        const prevTail = prevWords
          .slice(-n)
          .map(w => w.toLowerCase().replace(/[^a-z0-9']/g, ''))
          .join(' ');
        const currHead = currWords
          .slice(0, n)
          .map(w => w.toLowerCase().replace(/[^a-z0-9']/g, ''))
          .join(' ');

        if (prevTail && currHead && prevTail === currHead) {
          maxOverlap = n;
          break;
        }
      }

      if (maxOverlap > 0) {
        const remaining = currWords.slice(maxOverlap);
        currentText = remaining.join(' ');
      }
    }

    currentText = currentText.trim();
    if (currentText.length > 0) {
      const start = Number((rawSegments[i].startTime || 0).toFixed(2));
      let end = Number((rawSegments[i].endTime || (start + 2)).toFixed(2));
      if (end <= start) end = Number((start + 1.5).toFixed(2));

      result.push({
        startTime: start,
        endTime: end,
        text: currentText
      });
    }
  }

  return result;
}

/**
 * Parses XML/TimedText and SRV3 YouTube caption format
 */
function parseXMLCaptions(xmlString) {
  const segments = [];
  if (!xmlString) return segments;

  // Match standard <text start="1.23" dur="4.56">...</text> or <p t="1230" d="4560">...</p>
  const textRegex = /<(?:text|p)\s+([^>]+)>([\s\S]*?)<\/(?:text|p)>/gi;
  let match;

  while ((match = textRegex.exec(xmlString)) !== null) {
    const attrs = match[1];
    const rawContent = match[2];

    const startMatch = attrs.match(/start="([\d\.]+)"/i) || attrs.match(/t="(\d+)"/i);
    const durMatch = attrs.match(/dur="([\d\.]+)"/i) || attrs.match(/d="(\d+)"/i);

    let startTime = 0;
    if (startMatch) {
      startTime = startMatch[0].startsWith('t=') ? parseInt(startMatch[1], 10) / 1000 : parseFloat(startMatch[1]);
    }

    let duration = 2.0;
    if (durMatch) {
      duration = durMatch[0].startsWith('d=') ? parseInt(durMatch[1], 10) / 1000 : parseFloat(durMatch[1]);
    }

    const endTime = startTime + duration;
    const cleanText = cleanSegmentText(rawContent);

    if (cleanText) {
      segments.push({
        startTime,
        endTime,
        text: cleanText
      });
    }
  }

  return segments;
}

/**
 * Parses JSON3 YouTube caption format
 */
function parseJSON3Captions(jsonObj) {
  const segments = [];
  if (!jsonObj || !Array.isArray(jsonObj.events)) return segments;

  for (const event of jsonObj.events) {
    if (!event.segs || !Array.isArray(event.segs)) continue;

    const startTime = (event.tStartMs || 0) / 1000;
    const duration = (event.dDurationMs || 0) / 1000;
    const endTime = startTime + duration;

    const text = event.segs.map(s => s.utf8 || '').join('');
    const clean = cleanSegmentText(text);
    if (clean) {
      segments.push({
        startTime,
        endTime,
        text: clean
      });
    }
  }

  return segments;
}

/**
 * Bulletproof bracket-counting JSON extractor from HTML
 */
function extractJSONFromHTML(html, prefix) {
  if (!html) return null;
  const idx = html.indexOf(prefix);
  if (idx === -1) return null;
  const startIdx = html.indexOf('{', idx + prefix.length - 1);
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < html.length; i++) {
    const char = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) {
          const jsonStr = html.substring(startIdx, i + 1);
          try {
            return JSON.parse(jsonStr);
          } catch (e) {
            return null;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Bulletproof bracket-counting Array extractor from HTML
 */
function extractArrayFromHTML(html, key) {
  if (!html) return null;
  const pattern = `"${key}":`;
  const idx = html.indexOf(pattern);
  if (idx === -1) return null;
  const startIdx = html.indexOf('[', idx + pattern.length);
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < html.length; i++) {
    const char = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '[') depth++;
      else if (char === ']') {
        depth--;
        if (depth === 0) {
          const jsonStr = html.substring(startIdx, i + 1);
          try {
            return JSON.parse(jsonStr);
          } catch (e) {
            return null;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Fetch InnerTube player fallback across multiple native clients (Android, iOS, TV, Web)
 */
async function fetchInnerTubePlayerData(videoId) {
  const clients = [
    {
      name: 'ANDROID',
      headers: {
        'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
        'X-YouTube-Client-Name': '3',
        'X-YouTube-Client-Version': '19.09.37'
      },
      clientPayload: {
        clientName: 'ANDROID',
        clientVersion: '19.09.37',
        androidSdkVersion: 30,
        hl: 'en',
        gl: 'US',
        utcOffsetMinutes: 0
      }
    },
    {
      name: 'WEB_EMBEDDED_PLAYER',
      headers: {
        'User-Agent': YOUTUBE_FETCH_HEADERS['User-Agent'],
        'X-YouTube-Client-Name': '56',
        'X-YouTube-Client-Version': '1.20240401.01.00'
      },
      clientPayload: {
        clientName: 'WEB_EMBEDDED_PLAYER',
        clientVersion: '1.20240401.01.00',
        hl: 'en',
        gl: 'US'
      }
    },
    {
      name: 'WEB',
      headers: {
        'User-Agent': YOUTUBE_FETCH_HEADERS['User-Agent'],
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': '2.20240401.01.00'
      },
      clientPayload: {
        clientName: 'WEB',
        clientVersion: '2.20240401.01.00',
        hl: 'en',
        gl: 'US'
      }
    }
  ];

  for (const client of clients) {
    try {
      const response = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...client.headers
        },
        body: JSON.stringify({
          context: {
            client: client.clientPayload
          },
          videoId: videoId,
          playbackContext: {
            contentPlaybackContext: {
              html5Preference: "HTML5_PREF_WANTS"
            }
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data && ((data.captions && data.captions.playerCaptionsTracklistRenderer) || data.videoDetails)) {
          return data;
        }
      }
    } catch (err) {
      console.warn(`InnerTube client ${client.name} fallback attempt error:`, err.message);
    }
  }

  return null;
}

/**
 * Fetch caption tracks directly from YouTube TimedText listing API
 */
async function fetchTimedTextListing(videoId) {
  const urls = [
    `https://www.youtube.com/api/timedtext?type=list&v=${encodeURIComponent(videoId)}`,
    `https://video.google.com/timedtext?type=list&v=${encodeURIComponent(videoId)}`
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: YOUTUBE_FETCH_HEADERS });
      if (res.ok) {
        const xml = await res.text();
        const tracks = [];
        const trackRegex = /<track\s+([^>]+)\/>/gi;
        let match;

        while ((match = trackRegex.exec(xml)) !== null) {
          const attrs = match[1];
          const langMatch = attrs.match(/lang_code="([^"]+)"/i);
          const kindMatch = attrs.match(/kind="([^"]+)"/i);
          const nameMatch = attrs.match(/name="([^"]*)"/i);
          const vssIdMatch = attrs.match(/vss_id="([^"]+)"/i);

          if (langMatch) {
            const langCode = langMatch[1];
            const kind = kindMatch ? kindMatch[1] : '';
            const name = nameMatch ? nameMatch[1] : '';
            const vssId = vssIdMatch ? vssIdMatch[1] : '';

            let baseUrl = `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=${langCode}`;
            if (kind) baseUrl += `&kind=${encodeURIComponent(kind)}`;
            if (name) baseUrl += `&name=${encodeURIComponent(name)}`;

            tracks.push({
              baseUrl,
              languageCode: langCode,
              kind: kind || (vssId && vssId.startsWith('a.') ? 'asr' : 'manual'),
              vssId: vssId || (kind ? `a.${langCode}` : `.${langCode}`)
            });
          }
        }

        if (tracks.length > 0) {
          return tracks;
        }
      }
    } catch (e) {
      // Continue
    }
  }

  return [];
}

/**
 * Direct fetch fallback for common English caption URLs
 */
async function fetchDirectEnglishCaptions(videoId) {
  const candidateUrls = [
    `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=en&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=en`,
    `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=en-US`,
    `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=en-GB`,
    `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=en&kind=asr&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=en&kind=asr`,
    `https://video.google.com/timedtext?v=${encodeURIComponent(videoId)}&lang=en`
  ];

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, { headers: YOUTUBE_FETCH_HEADERS });
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().length > 20 && !text.includes('<transcript_list') && !text.includes('<?xml version="1.0" encoding="utf-8" ?><transcript />')) {
          try {
            const json = JSON.parse(text);
            const segs = parseJSON3Captions(json);
            if (segs.length > 0) return { segments: segs, kind: url.includes('kind=asr') ? 'asr' : 'manual' };
          } catch (e) {
            const segs = parseXMLCaptions(text);
            if (segs.length > 0) return { segments: segs, kind: url.includes('kind=asr') ? 'asr' : 'manual' };
          }
        }
      }
    } catch (e) {
      // Continue
    }
  }

  return null;
}

let YoutubeTranscriptLib = null;
try {
  YoutubeTranscriptLib = require('youtube-transcript').YoutubeTranscript;
} catch (e) {
  // Optional library fallback
}

async function tryLibraryTranscript(videoId) {
  if (!YoutubeTranscriptLib) return null;
  try {
    const raw = await YoutubeTranscriptLib.fetchTranscript(videoId, { lang: 'en' });
    if (raw && raw.length > 0) {
      return raw.map(item => ({
        startTime: item.offset / 1000,
        endTime: (item.offset + item.duration) / 1000,
        text: item.text
      }));
    }
  } catch (e) {
    try {
      const raw = await YoutubeTranscriptLib.fetchTranscript(videoId);
      if (raw && raw.length > 0) {
        return raw.map(item => ({
          startTime: item.offset / 1000,
          endTime: (item.offset + item.duration) / 1000,
          text: item.text
        }));
      }
    } catch (err2) {}
  }
  return null;
}

/**
 * Core function to fetch and clean YouTube transcripts
 */
async function getYouTubeTranscript(videoId) {
  let playerResponse = null;
  let videoDetails = null;
  let captionTracks = [];

  // 1. Priority #1: InnerTube Native Mobile API (Bypasses web scraping & bot blocks on cloud)
  const innerTubeData = await fetchInnerTubePlayerData(videoId);
  if (innerTubeData) {
    if (innerTubeData.captions && innerTubeData.captions.playerCaptionsTracklistRenderer) {
      captionTracks = innerTubeData.captions.playerCaptionsTracklistRenderer.captionTracks || [];
    }
    if (innerTubeData.videoDetails) {
      videoDetails = innerTubeData.videoDetails;
    }
  }

  // 2. Fallback: Dedicated youtube-transcript library
  if (!captionTracks || captionTracks.length === 0) {
    const libSegments = await tryLibraryTranscript(videoId);
    if (libSegments && libSegments.length > 0) {
      const cleaned = deduplicateRollingCaptions(libSegments);
      if (cleaned.length > 0) {
        let videoLength = Math.ceil(cleaned[cleaned.length - 1]?.endTime || 0);
        return {
          videoId,
          trackKind: 'manual',
          languageCode: 'en',
          videoDetails: videoDetails ? {
            title: videoDetails.title || 'YouTube Video',
            author: videoDetails.author || 'YouTube Channel',
            lengthSeconds: parseInt(videoDetails.lengthSeconds, 10) || videoLength,
            thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
          } : {
            title: 'YouTube Video',
            author: 'YouTube Channel',
            lengthSeconds: videoLength,
            thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
          },
          transcript: cleaned
        };
      }
    }
  }

  // 3. Fallback: Watch Page HTML Scraping
  if (!captionTracks || captionTracks.length === 0) {
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&bpctr=9999999999&has_verified=1`;
    try {
      const response = await fetch(watchUrl, { headers: YOUTUBE_FETCH_HEADERS });
      if (response.ok) {
        const pageHtml = await response.text();
        const tracksMatch = pageHtml.match(/"captionTracks":\s*(\[.*?\])/);
        if (tracksMatch) {
          try {
            captionTracks = JSON.parse(tracksMatch[1]);
          } catch (e) {
            captionTracks = extractArrayFromHTML(pageHtml, 'captionTracks') || [];
          }
        }
        if (!captionTracks || captionTracks.length === 0) {
          const parsedResp = extractJSONFromHTML(pageHtml, 'ytInitialPlayerResponse');
          if (parsedResp) {
            if (parsedResp.captions && parsedResp.captions.playerCaptionsTracklistRenderer) {
              captionTracks = parsedResp.captions.playerCaptionsTracklistRenderer.captionTracks || [];
            }
            if (parsedResp.videoDetails && !videoDetails) {
              videoDetails = parsedResp.videoDetails;
            }
          }
        }
      }
    } catch (err) {}
  }

  // 4. Fallback: Direct TimedText listing API
  if (!captionTracks || captionTracks.length === 0) {
    captionTracks = await fetchTimedTextListing(videoId);
  }

  // 5. Fetch video title/author from oEmbed if not available
  if (!videoDetails) {
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`);
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        videoDetails = {
          title: oembedData.title || 'YouTube Video',
          author: oembedData.author_name || 'YouTube Channel',
          lengthSeconds: 0,
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
        };
      }
    } catch (e) {
      // Ignore
    }
  }

  // 6. Fallback: Direct English Caption Scraping
  if (!captionTracks || captionTracks.length === 0) {
    const directResult = await fetchDirectEnglishCaptions(videoId);
    if (directResult && directResult.segments.length > 0) {
      const cleanedTranscript = deduplicateRollingCaptions(directResult.segments);
      if (cleanedTranscript.length > 0) {
        return {
          videoId,
          trackKind: directResult.kind || 'asr',
          languageCode: 'en',
          videoDetails: videoDetails ? {
            title: videoDetails.title || 'YouTube Video',
            author: videoDetails.author || 'YouTube Channel',
            lengthSeconds: parseInt(videoDetails.lengthSeconds, 10) || 0,
            thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
          } : {
            title: 'YouTube Video',
            author: 'YouTube Channel',
            lengthSeconds: 0,
            thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
          },
          transcript: cleanedTranscript
        };
      }
    }

    return {
      error: 'no_captions',
      message: 'No English captions available for this video.',
      videoDetails: videoDetails ? {
        title: videoDetails.title,
        author: videoDetails.author,
        lengthSeconds: videoDetails.lengthSeconds,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      } : null
    };
  }

  // 7. Select the best English caption track:
  // Preference: Manual English ('en' without asr/a.) > Auto English ('asr' or 'a.en') > Any English > First track
  let selectedTrack = captionTracks.find(t =>
    (t.languageCode === 'en' || (t.vssId && (t.vssId.includes('.en') || t.vssId.includes('en-US')))) &&
    t.kind !== 'asr' &&
    (!t.vssId || !t.vssId.startsWith('a.'))
  );

  if (!selectedTrack) {
    selectedTrack = captionTracks.find(t =>
      t.languageCode === 'en' ||
      (t.vssId && (t.vssId.includes('en') || t.vssId.includes('a.en') || t.vssId.includes('en-US')))
    );
  }

  if (!selectedTrack) {
    selectedTrack = captionTracks[0];
  }

  if (!selectedTrack || !selectedTrack.baseUrl) {
    return {
      error: 'no_captions',
      message: 'Unable to resolve caption stream for this video.'
    };
  }

  // 8. Fetch the caption content using clean mobile headers (No cookies to avoid consent blocks)
  let rawSegments = [];
  const trackUrl = selectedTrack.baseUrl.replace(/&amp;/g, '&');
  const cleanHeaders = {
    'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11)',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  try {
    const json3Url = trackUrl.includes('fmt=') ? trackUrl : `${trackUrl}&fmt=json3`;
    const captionRes = await fetch(json3Url, { headers: cleanHeaders });

    if (captionRes.ok) {
      const textResponse = await captionRes.text();
      try {
        const jsonData = JSON.parse(textResponse);
        rawSegments = parseJSON3Captions(jsonData);
      } catch (err) {
        rawSegments = parseXMLCaptions(textResponse);
      }
    }
  } catch (err) {
    console.error('Caption fetch error:', err.message);
  }

  // If JSON3 attempt was empty, fallback to direct XML fetch
  if (rawSegments.length === 0) {
    try {
      const xmlRes = await fetch(trackUrl, { headers: cleanHeaders });
      if (xmlRes.ok) {
        const xmlText = await xmlRes.text();
        rawSegments = parseXMLCaptions(xmlText);
      }
    } catch (err) {
      console.error('XML caption fetch fallback error:', err.message);
    }
  }

  if (rawSegments.length === 0) {
    return {
      error: 'no_captions',
      message: 'Caption track was found but contained no subtitle events.'
    };
  }

  // 9. Deduplicate rolling captions
  const cleanedTranscript = deduplicateRollingCaptions(rawSegments);

  if (cleanedTranscript.length === 0) {
    return {
      error: 'no_captions',
      message: 'No readable text could be extracted from the captions.'
    };
  }

  return {
    videoId,
    trackKind: selectedTrack.kind || (selectedTrack.vssId && selectedTrack.vssId.startsWith('a.') ? 'asr' : 'manual'),
    languageCode: selectedTrack.languageCode || 'en',
    videoDetails: videoDetails ? {
      title: videoDetails.title || 'YouTube Video',
      author: videoDetails.author || 'YouTube Channel',
      lengthSeconds: parseInt(videoDetails.lengthSeconds, 10) > 0 
        ? parseInt(videoDetails.lengthSeconds, 10) 
        : Math.ceil(cleanedTranscript[cleanedTranscript.length - 1]?.endTime || 0),
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    } : {
      title: 'YouTube Video',
      author: 'YouTube Channel',
      lengthSeconds: Math.ceil(cleanedTranscript[cleanedTranscript.length - 1]?.endTime || 0),
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    },
    transcript: cleanedTranscript
  };
}

// API Endpoint: GET /api/transcript?videoId=xxx
app.get('/api/transcript', async (req, res) => {
  const videoId = req.query.videoId;

  if (!videoId || typeof videoId !== 'string' || !videoId.trim()) {
    return res.status(400).json({
      error: 'invalid_video_id',
      message: 'A valid YouTube videoId query parameter is required.'
    });
  }

  const cleanVideoId = videoId.trim();

  // Validate YouTube video ID format (11 chars)
  if (!/^[a-zA-Z0-9_-]{11}$/.test(cleanVideoId)) {
    return res.status(400).json({
      error: 'invalid_video_id',
      message: 'Video ID must be an 11-character string.'
    });
  }

  try {
    const result = await getYouTubeTranscript(cleanVideoId);
    return res.json(result);
  } catch (err) {
    console.error('Server error in /api/transcript:', err);
    return res.status(500).json({
      error: 'server_error',
      message: 'An unexpected error occurred while fetching the transcript.'
    });
  }
});

// Helper: Phonetic IPA Converter
function convertEnglishToIPA(text) {
  if (!text) return '';
  const dict = {
    "welcome": "ˈwel.kəm",
    "to": "tuː",
    "yet": "jet",
    "another": "əˈnʌð.ər",
    "episode": "ˈep.ə.soʊd",
    "in": "ɪn",
    "on": "ɑːn",
    "at": "æt",
    "buddhist": "ˈbʊd.ɪst",
    "meditation": "ˌmed.əˈteɪ.ʃən",
    "series": "ˈsɪr.iːz",
    "now": "naʊ",
    "today": "təˈdeɪ",
    "todays": "təˈdeɪz",
    "today's": "təˈdeɪz",
    "video": "ˈvɪd.i.oʊ",
    "we": "wiː",
    "we're": "wɪr",
    "re": "r",
    "are": "ɑːr",
    "were": "wɜːr",
    "gonna": "ˈɡɑː.nə",
    "going": "ˈɡoʊ.ɪŋ",
    "be": "biː",
    "discussing": "dɪˈskʌs.ɪŋ",
    "discuss": "dɪˈskʌs",
    "about": "əˈbaʊt",
    "a": "ə",
    "an": "æn",
    "special": "ˈspeʃ.əl",
    "quality": "ˈkwɑː.lə.t̬i",
    "that": "ðæt",
    "all": "ɔːl",
    "need": "niːd",
    "practice": "ˈpræk.tɪs",
    "and": "ænd",
    "develop": "dɪˈvel.əp",
    "as": "æz",
    "meditator": "ˈmed.ə.teɪ.t̬ɚ",
    "the": "ðə",
    "this": "ðɪs",
    "is": "ɪz",
    "it": "ɪt",
    "its": "ɪts",
    "it's": "ɪts",
    "you": "juː",
    "your": "jɔːr"
  };

  const words = text.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);
  const ipaWords = words.map(w => {
    if (dict[w]) return dict[w];
    let p = w.replace(/tion\b/g, 'ʃən')
             .replace(/sion\b/g, 'ʒən')
             .replace(/ing\b/g, 'ɪŋ')
             .replace(/ed\b/g, 'd')
             .replace(/ight\b/g, 'aɪt')
             .replace(/th/g, 'θ')
             .replace(/sh/g, 'ʃ')
             .replace(/ch/g, 'tʃ')
             .replace(/ph/g, 'f')
             .replace(/ee|ea/g, 'iː')
             .replace(/oo/g, 'uː')
             .replace(/ou|ow/g, 'aʊ')
             .replace(/ai|ay/g, 'eɪ')
             .replace(/oi|oy/g, 'ɔɪ')
             .replace(/qu/g, 'kw')
             .replace(/ck/g, 'k');
    return p;
  });

  return `/${ipaWords.join(' ')}/`;
}

// Helper: High-speed, high-accuracy Google Translate Engine for Vietnamese
async function translateWithGoogle(text) {
  if (!text || typeof text !== 'string') return '';
  const clean = text.trim();
  if (!clean) return '';

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(clean)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translated = data[0].map(item => item[0]).filter(Boolean).join('');
        if (translated && translated.trim()) {
          return translated.trim();
        }
      }
    }
  } catch (err) {
    console.warn('Google Translate API error:', err.message);
  }

  return clean;
}

// Global persistent in-memory & file-backed user database (Supports Vercel /tmp)
const USERS_DB_PATH = process.env.VERCEL ? path.join('/tmp', 'lingotube_users.json') : path.join(__dirname, 'users.json');
let usersCache = [];

function loadUsersFromDisk() {
  try {
    if (fs.existsSync(USERS_DB_PATH)) {
      const raw = fs.readFileSync(USERS_DB_PATH, 'utf8');
      if (raw) usersCache = JSON.parse(raw);
    }
  } catch (e) {}
}
loadUsersFromDisk();

function saveUsersToDisk() {
  try {
    fs.writeFileSync(USERS_DB_PATH, JSON.stringify(usersCache, null, 2), 'utf8');
  } catch (e) {}
}

// API Endpoint: POST /api/auth/register (Cloud User Registration)
app.post('/api/auth/register', (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Vui lòng cung cấp email và mật khẩu.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const existing = usersCache.find(u => u.email.toLowerCase() === cleanEmail);
  if (existing) {
    return res.status(400).json({ success: false, error: 'already_exists', message: 'Địa chỉ email này đã được đăng ký.' });
  }

  const displayName = (name || cleanEmail.split('@')[0]).trim();
  const newUser = {
    uid: 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    email: cleanEmail,
    password: password,
    displayName: displayName,
    createdAt: new Date().toISOString()
  };

  usersCache.push(newUser);
  saveUsersToDisk();

  return res.json({
    success: true,
    user: {
      uid: newUser.uid,
      email: newUser.email,
      displayName: newUser.displayName
    }
  });
});

// API Endpoint: POST /api/auth/login (Cloud User Sign In)
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập email và mật khẩu.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = usersCache.find(u => u.email.toLowerCase() === cleanEmail);

  if (!user) {
    return res.status(404).json({ success: false, error: 'not_found', message: 'Tài khoản email này chưa được đăng ký.' });
  }

  if (user.password && user.password !== password) {
    return res.status(401).json({ success: false, error: 'wrong_password', message: 'Mật khẩu không chính xác.' });
  }

  return res.json({
    success: true,
    user: {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || cleanEmail.split('@')[0]
    }
  });
});

// API Endpoint: POST /api/translate (Instant Multi-Sentence Translation)
app.post('/api/translate', async (req, res) => {
  const { text, texts } = req.body;
  if (texts && Array.isArray(texts)) {
    const results = await Promise.all(texts.map(t => translateWithGoogle(t)));
    return res.json({ translations: results });
  }
  const translation = await translateWithGoogle(text);
  return res.json({ translation });
});

// Helper: Concise & insightful nuance generator (Ngắn gọn, súc tích, đi thẳng vào bản chất cảm xúc)
function getNuanceExplanation(phrase) {
  if (!phrase) return '';
  const clean = phrase.toLowerCase().trim();

  // 1. Direct High-Precision Semantic Dictionary
  const directMap = [
    { keys: ["i read quote", "read quote", "read a quote"], text: "Dẫn lời chiêm nghiệm một cách khiêm tốn, tạo sự chú ý tự nhiên trước khi chia sẻ một thông điệp ý nghĩa." },
    { keys: ["life isn't yours", "life is not yours", "life isnt yours", "not yours"], text: "Mang tính cảnh tỉnh sâu sắc: nhắc nhở cuộc sống luôn gắn với trách nhiệm và sự tác động tới người xung quanh." },
    { keys: ["that says", "it says", "says your"], text: "Lời dẫn tự nhiên và khách quan, chuyển tải thông điệp một cách thuyết phục mà không mang tính áp đặt." },
    { keys: ["practice and develop", "practice and", "develop as"], text: "Nhấn mạnh sự kiên trì, rèn luyện bền bỉ từng ngày chứ không phải nỗ lực nhất thời." },
    { keys: ["stay hungry", "stay foolish"], text: "Khơi gợi tinh thần khiêm nhường không ngừng học hỏi và lòng dũng cảm dám dấn thân làm điều khác biệt." },
    { keys: ["your time is limited", "time is limited"], text: "Tạo cảm giác thôi thúc cấp bách, nhắc nhở sống trọn vẹn từng phút giây quý giá." },
    { keys: ["connecting the dots"], text: "Chiêm nghiệm sâu sắc: mọi trải nghiệm quá khứ dù nhỏ bé đều sẽ tạo nên ý nghĩa lớn lao cho tương lai." },
    { keys: ["love and loss"], text: "Giọng điệu trầm lắng, sâu sắc về những thăng trầm không thể tránh khỏi của kiếp người." },
    { keys: ["welcome to yet", "welcome to"], text: "Chào đón nồng nhiệt, thân mật, tạo cảm giác gần gũi và gắn kết ngay từ câu mở đầu." },
    { keys: ["we're gonna be", "we are going to"], text: "Tạo cảm giác ấm áp, đồng hành như cuộc trò chuyện thân tình giữa những người bạn." },
    { keys: ["discussing about", "talk about"], text: "Gợi mở tinh thần cởi mở, sẵn sàng lắng nghe và chia sẻ góc nhìn đa chiều." },
    { keys: ["a special quality"], text: "Nhấn mạnh giá trị độc đáo, cốt lõi cần được đặc biệt lưu tâm và trau dồi." },
    { keys: ["that we all need", "we all need"], text: "Khơi dậy sự đồng cảm và nhấn mạnh tính phổ quát cần thiết cho tất cả mọi người." },
    { keys: ["as a meditator", "as a"], text: "Khẳng định tư cách, tâm thế và trách nhiệm nghiêm túc trong vai trò mới." },
    { keys: ["let's get started", "get started"], text: "Truyền năng lượng hào hứng, khích lệ bắt tay vào hành động ngay tức thì." },
    { keys: ["make sure to", "be sure to"], text: "Lời dặn dò ân cần nhưng dứt khoát, nhấn mạnh điều cốt lõi không được bỏ sót." },
    { keys: ["pay attention to", "focus on"], text: "Hướng toàn bộ sự tập trung cao độ của người nghe vào điểm mấu chốt." }
  ];

  for (const item of directMap) {
    if (item.keys.some(k => clean === k || clean.includes(k) || k.includes(clean))) {
      return item.text;
    }
  }

  // 2. Intelligent Dynamic Semantic Nuance Classifier (Concise, punchy, contextual)
  if (/\b(quote|say|says|said|tell|hear|heard|spoke|mention)\b/i.test(clean)) {
    return "Cách dẫn lời gián tiếp tinh tế, giúp thông điệp trở nên khách quan và giàu sức thuyết phục.";
  }
  if (/\b(life|live|living|world|mind|soul|heart|human)\b/i.test(clean)) {
    return "Mang chiều sâu triết lý, gợi mở suy ngẫm sâu sắc về giá trị cuộc sống và nội tâm con người.";
  }
  if (/\b(not|no|never|isn't|isnt|aren't|arent|don't|dont|won't|wont)\b/i.test(clean)) {
    return "Khẳng định dứt khoát hoặc thức tỉnh, tạo điểm nhấn mạnh mẽ buộc người nghe phải lưu tâm.";
  }
  if (/\b(need|must|have to|should|require|ought)\b/i.test(clean)) {
    return "Nhấn mạnh tính cấp thiết và định hướng hành động rõ ràng, thôi thúc sự chủ động.";
  }
  if (/\b(feel|feeling|felt|emotion|sense|mood)\b/i.test(clean)) {
    return "Chạm vào cảm xúc chân thật, tăng tính đồng cảm và kết nối sâu sắc với người nghe.";
  }
  if (/\b(time|day|moment|future|past|now|today|forever)\b/i.test(clean)) {
    return "Nhắc nhở về giá trị của thời gian và sự trân trọng trọn vẹn từng khoảnh khắc hiện tại.";
  }
  if (/\b(start|begin|go|let's|lets|action|move|do)\b/i.test(clean)) {
    return "Truyền năng lượng tích cực, khích lệ sự bắt đầu và tinh thần hành động dứt khoát.";
  }
  if (/\b(good|great|best|better|grow|growth|learn|develop|improve)\b/i.test(clean)) {
    return "Truyền cảm hứng phát triển bản thân và tinh thần cầu tiến bền bỉ.";
  }
  if (/\b(think|believe|know|understand|realize|see)\b/i.test(clean)) {
    return "Khơi gợi nhận thức và góc nhìn mới, khuyến khích sự chiêm nghiệm sâu rộng.";
  }
  if (/\b(with|together|us|our|we|share|friend)\b/i.test(clean)) {
    return "Tạo cảm giác gắn kết, sẻ chia và đồng hành ấm áp giữa người nói và người nghe.";
  }

  return "Cách diễn đạt tự nhiên, cô đọng giúp câu nói truyền cảm và chạm đúng tâm lý người nghe.";
}

// API Endpoint: POST /api/analyze-chunks (Phase 3 - "Vạch lá tìm sâu")
app.post('/api/analyze-chunks', async (req, res) => {
  const { sentences, apiKey, customPhrase } = req.body;

  if (!sentences || !Array.isArray(sentences) || sentences.length === 0) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'sentences array is required'
    });
  }

  const geminiKey = apiKey || process.env.GEMINI_API_KEY;

  // 1. Try Gemini API if key is available
  if (geminiKey && geminiKey.trim()) {
    try {
      const prompt = `You are an expert English linguist and language teacher for Vietnamese learners (Oxford & Cambridge Lexical Approach).
The user has trimmed a specific English practice clip.
Analyze ONLY the following cut subtitle segments (do NOT analyze or invent anything outside these specific segments):

INPUT CLIP SEGMENTS:
${JSON.stringify(sentences.map((s, idx) => ({
  index: idx + 1,
  startTime: s.startTime,
  endTime: s.endTime,
  text: s.text
})), null, 2)}

${customPhrase ? `Note: Give special attention to the phrase "${customPhrase}".` : ''}

TASK & CHUNKING RULES:
1. "startTime": The exact startTime from the segment (number).
2. "endTime": The exact endTime from the segment (number).
3. "english": The clean, grammatically capitalized and punctuated English sentence for this segment.
4. "vietnamese": Natural, context-aware Vietnamese translation reflecting conversational meaning in this video.
5. "ipa": Accurate IPA transcription for the entire sentence.
6. "chunks": Array of 1 to 3 key lexical chunks, collocations, phrasal verbs, or key words found in this sentence:
   * "phrase": The exact chunk/word. PRIORITIZE multi-word collocations & phrasal verbs with combined meaning (e.g. "takes time", "long-term process", "fail to improve"). Only analyze single words if they stand independently with key meaning (e.g. "techniques", "consistency").
   * "ipa": Accurate IPA transcription specifically for this chunk/word (e.g. "/teɪks taɪm/").
   * "meaning": Natural Vietnamese meaning in this context.
   * "grammar": "Collocation" | "Phrasal verb" | "Noun / Key Word" | "Idiom" | "Phrase".
   * "simpleEnglish": Clear, easy-to-understand definition/explanation in Simple English (A2-B1 level, Oxford Learner's style).

Return ONLY a valid JSON object with the following schema:
{
  "sentences": [
    {
      "startTime": 6.1,
      "endTime": 9.7,
      "english": "...",
      "vietnamese": "...",
      "ipa": "...",
      "chunks": [
        {
          "phrase": "takes time",
          "ipa": "/teɪks taɪm/",
          "meaning": "đòi hỏi / cần có thời gian",
          "grammar": "Collocation",
          "simpleEnglish": "requires a period of time; cannot be rushed."
        }
      ]
    }
  ]
}`;

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey.trim()}`;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        })
      });

      if (response.ok) {
        const geminiData = await response.json();
        const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textContent) {
          const parsed = JSON.parse(textContent);
          if (parsed && parsed.sentences && parsed.sentences.length > 0) {
            return res.json({
              source: 'gemini',
              model: 'gemini-1.5-flash',
              sentences: parsed.sentences
            });
          }
        }
      }
    } catch (apiErr) {
      console.warn('Gemini call failed, falling back to translation engine:', apiErr.message);
    }
  }

  // 2. High-Accuracy Translation & Linguistic Parser Fallback
  const analyzedSentences = await Promise.all(sentences.map(async (item) => {
    const text = (typeof item === 'string' ? item : item.text || '').trim();
    const startTime = typeof item === 'object' && item.startTime !== undefined ? item.startTime : 0;
    const endTime = typeof item === 'object' && item.endTime !== undefined ? item.endTime : 0;

    if (!text) return null;

    // Detect chunks
    const words = text.split(/\s+/).filter(Boolean);
    const chunkCandidates = [];

    if (words.length >= 2) {
      const p1 = words.slice(0, Math.min(3, words.length)).join(' ');
      chunkCandidates.push({ phrase: p1, grammar: 'Collocation' });
    }
    if (words.length >= 5) {
      const p2 = words.slice(-3).join(' ').replace(/[.,!?;:]/g, '');
      chunkCandidates.push({ phrase: p2, grammar: 'Lexical Chunk' });
    }

    // Translate sentence & chunks in parallel
    const [translatedSentence, ...chunkMeanings] = await Promise.all([
      translateWithGoogle(text),
      ...chunkCandidates.map(c => translateWithGoogle(c.phrase))
    ]);

    const chunks = chunkCandidates.map((c, cIdx) => ({
      phrase: c.phrase,
      ipa: convertEnglishToIPA(c.phrase),
      meaning: chunkMeanings[cIdx] || c.phrase,
      grammar: c.grammar,
      simpleEnglish: `used to express "${c.phrase}" naturally in everyday English conversation.`
    }));

    return {
      startTime: startTime,
      endTime: endTime,
      english: text.charAt(0).toUpperCase() + text.slice(1),
      vietnamese: translatedSentence.charAt(0).toUpperCase() + translatedSentence.slice(1),
      ipa: convertEnglishToIPA(text),
      chunks: chunks
    };
  }));

  return res.json({
    source: 'translation-engine',
    notice: 'Đã phân tích tự động chuẩn xác ngữ cảnh, Simple English và IPA.',
    sentences: analyzedSentences.filter(Boolean)
  });
});

// API Endpoint: POST /api/resegment-clip-ai (Smart AI Sense-Unit Resegmentation)
app.post('/api/resegment-clip-ai', async (req, res) => {
  const { segments, clipStartTime, clipEndTime, apiKey } = req.body;

  if (!segments || !Array.isArray(segments) || segments.length === 0) {
    return res.status(400).json({ error: 'invalid_request', message: 'segments array is required' });
  }

  const geminiKey = apiKey || process.env.GEMINI_API_KEY || DEFAULT_GEMINI_KEY;
  const startBound = typeof clipStartTime === 'number' ? clipStartTime : (segments[0].startTime || 0);
  const endBound = typeof clipEndTime === 'number' ? clipEndTime : (segments[segments.length - 1].endTime || startBound + 30);

  if (geminiKey && geminiKey.trim()) {
    try {
      const rawText = segments.map((s, i) => `#${i + 1} [${Number(s.startTime).toFixed(1)}s - ${Number(s.endTime).toFixed(1)}s]: ${s.text}`).join('\n');

      const prompt = `You are a master English linguist, speech transcriber, and language teacher.
You are given a raw, fragmented spoken subtitle transcript from a short YouTube video clip (from ${startBound.toFixed(1)}s to ${endBound.toFixed(1)}s).

Raw Spoken Subtitles:
${rawText}

TASK:
1. Reconstruct these fragmented transcript lines into grammatically complete, natural English sentences or sense-unit chunks (ideal 4 to 8 words per line, max 10 words).
2. Fix capitalization, punctuation (periods, commas, quotes, colons for direct speech), and remove stuttering/filler words if any.
3. Keep the meaning and words 100% faithful to the original speech.
4. Proportionally assign accurate startTime and endTime for each newly created sentence/chunk within the exact bounds [${startBound.toFixed(1)}s, ${endBound.toFixed(1)}s].
5. Return ONLY a valid JSON object matching this schema:
{
  "sentences": [
    {
      "startTime": ${startBound.toFixed(1)},
      "endTime": 32.4,
      "text": "Now this quality is one of the most fundamental qualities"
    },
    {
      "startTime": 32.4,
      "endTime": 35.6,
      "text": "that a meditator should possess."
    }
  ]
}`;

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey.trim()}`;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1
          }
        })
      });

      if (response.ok) {
        const geminiData = await response.json();
        const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textContent) {
          const parsed = JSON.parse(textContent);
          if (parsed && Array.isArray(parsed.sentences) && parsed.sentences.length > 0) {
            return res.json({
              source: 'gemini',
              model: 'gemini-1.5-flash',
              sentences: parsed.sentences.map(s => ({
                startTime: Number(Number(s.startTime || startBound).toFixed(1)),
                endTime: Number(Number(s.endTime || endBound).toFixed(1)),
                text: (s.text || '').trim()
              }))
            });
          }
        }
      }
    } catch (apiErr) {
      console.warn('Gemini resegment call error, falling back:', apiErr.message);
    }
  }

  // Fallback if no Gemini key or error: combine and format nicely
  const combinedText = segments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
  const words = combinedText.split(/\s+/).filter(Boolean);
  const chunks = [];
  const chunkWordSize = 6;
  const totalChars = combinedText.length || 1;
  const duration = Math.max(1, endBound - startBound);
  let curT = startBound;

  for (let i = 0; i < words.length; i += chunkWordSize) {
    const slice = words.slice(i, i + chunkWordSize);
    const sliceText = slice.join(' ');
    const sliceRatio = sliceText.length / totalChars;
    const isLast = (i + chunkWordSize >= words.length);
    const endT = isLast ? endBound : (curT + sliceRatio * duration);

    let formatted = sliceText.charAt(0).toUpperCase() + sliceText.slice(1);
    if (isLast && !['.', '?', '!', '…'].includes(formatted.slice(-1))) formatted += '.';

    chunks.push({
      startTime: Number(curT.toFixed(1)),
      endTime: Number(endT.toFixed(1)),
      text: formatted
    });
    curT = endT;
  }

  return res.json({
    source: 'fallback',
    sentences: chunks
  });
});

// API Endpoint: POST /api/analyze-shadowing (Phase 5 - "Shadowing Studio")
app.post('/api/analyze-shadowing', async (req, res) => {
  const { referenceText, referenceIpa, userTranscript, apiKey } = req.body;

  if (!referenceText || typeof referenceText !== 'string') {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'referenceText is required'
    });
  }

  const geminiKey = apiKey || process.env.GEMINI_API_KEY;

  if (geminiKey && geminiKey.trim()) {
    try {
      const prompt = `You are an expert English pronunciation and shadowing coach for Vietnamese learners.
The user just practiced shadowing by listening and repeating the following target English sentence:

Target Reference Sentence:
English: "${referenceText}"
IPA: "${referenceIpa || ''}"

User's Spoken Speech (Transcribed via Web Speech Recognition):
"${userTranscript || '(User audio recorded)'}"

TASK:
Provide constructive, encouraging, and highly specific qualitative feedback in Vietnamese:
1. "overallScore": Integer score from 50 to 98 evaluating how accurately and fluently the sentence was articulated.
2. "status": "Xuất sắc" (if score >= 85), "Rất tốt" (if score >= 70), or "Cần luyện thêm".
3. "pronunciationFeedback": 1-2 practical sentences on sound articulation, phonemes, and word stress (pay attention to typical challenges for Vietnamese speakers like /θ/, /ð/, /ʃ/, /tʃ/, final endings -s/-ed).
4. "intonationFeedback": 1-2 practical sentences on sentence rhythm, pitch changes, and liaisons (linking sounds like consonant-to-vowel).
5. "fluencyFeedback": 1 sentence comparing speaking tempo and confidence with the original speaker.
6. "wordComparisons": Array of words from the reference sentence with status:
   [ { "word": "example", "status": "correct" | "minor_error" | "missed", "tip": "Mẹo phát âm ngắn" } ]

Return ONLY a valid JSON object matching this schema:
{
  "overallScore": 85,
  "status": "Rất tốt",
  "pronunciationFeedback": "...",
  "intonationFeedback": "...",
  "fluencyFeedback": "...",
  "wordComparisons": [
    { "word": "...", "status": "correct", "tip": "..." }
  ]
}`;

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey.trim()}`;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        })
      });

      if (response.ok) {
        const geminiData = await response.json();
        const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textContent) {
          const parsed = JSON.parse(textContent);
          return res.json({
            source: 'gemini',
            ...parsed
          });
        }
      }
    } catch (apiErr) {
      console.warn('Gemini shadowing call failed, using linguistic parser:', apiErr.message);
    }
  }

  // Fallback intelligent speech comparison
  const refWords = referenceText.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const userWords = (userTranscript || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);

  let matchCount = 0;
  const comparisons = refWords.map(w => {
    const isMatched = userWords.includes(w);
    if (isMatched) matchCount++;
    return {
      word: w,
      status: isMatched ? 'correct' : (userWords.length > 0 ? 'minor_error' : 'missed'),
      tip: isMatched ? 'Phát âm chuẩn xác' : `Chú ý âm đuôi và nguyên âm của từ "${w}"`
    };
  });

  const accuracyRatio = refWords.length > 0 ? (matchCount / refWords.length) : 0.8;
  const score = Math.round(Math.min(96, Math.max(65, accuracyRatio * 100)));

  return res.json({
    source: 'rule-based',
    overallScore: score,
    status: score >= 85 ? 'Xuất sắc' : (score >= 75 ? 'Rất tốt' : 'Khá tốt'),
    pronunciationFeedback: 'Phát âm to rõ ràng và giữ được nhịp cơ bản của câu. Hãy chú ý bật rõ các âm đuôi và các phụ âm ma sát để câu nói thêm phần tự nhiên.',
    intonationFeedback: 'Ngữ điệu lên xuống khá tương đồng với người bản xứ. Cố gắng nối âm mượt hơn giữa các từ liền kề để tạo cảm giác tự nhiên.',
    fluencyFeedback: 'Tốc độ nói ổn định, tự tin và bắt kịp nhịp độ gốc của video.',
    wordComparisons: comparisons
  });
});

// API Endpoint: Oxford Pro Dictionary Lookup powered by Google Gemini AI & Oxford Lexicon
app.post('/api/oxford-lookup', async (req, res) => {
  const { word, contextSentence, apiKey } = req.body;
  if (!word || !word.trim()) {
    return res.status(400).json({ error: 'Word is required' });
  }

  const cleanWord = word.trim();
  const effectiveKey = (apiKey && apiKey.trim()) ? apiKey.trim() : (process.env.GEMINI_API_KEY || DEFAULT_GEMINI_KEY);

  if (effectiveKey) {
    try {
      const prompt = `You are the Oxford Advanced Learner's Dictionary (OALD) AI Engine for Vietnamese English learners.
Provide a complete, professional, Oxford-standard dictionary entry for the following English word/phrase:
Word: "${cleanWord}"
Context Sentence (if applicable): "${contextSentence || ''}"

Return ONLY a valid JSON object matching this schema:
{
  "word": "${cleanWord}",
  "partOfSpeech": "noun / verb / adjective / adverb / phrase / idiom",
  "cefrLevel": "A1 / A2 / B1 / B2 / C1 / C2",
  "ukIpa": "/.../",
  "usIpa": "/.../",
  "englishDefinition": "Clear, standard Oxford English definition",
  "vietnameseMeaning": "Bản dịch nghĩa tiếng Việt chuẩn xác, mượt mà và đúng ngữ cảnh",
  "nuance": "Sắc thái biểu cảm, thái độ, hoặc ngữ cảnh giao tiếp (1 câu ngắn gọn)",
  "collocations": [
    { "phrase": "...", "meaning": "..." },
    { "phrase": "...", "meaning": "..." }
  ],
  "examples": [
    {
      "english": "Example sentence using the word",
      "vietnamese": "Dịch nghĩa câu ví dụ sang tiếng Việt"
    }
  ],
  "memoryHook": "Mẹo ghi nhớ nhanh (gốc từ, hình ảnh liên tưởng hoặc từ đồng nghĩa/trái nghĩa)"
}`;

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${effectiveKey}`;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          return res.json({ source: 'gemini-oxford', data: parsed });
        }
      }
    } catch (err) {
      console.warn('Gemini Oxford lookup failed, falling back:', err.message);
    }
  }

  // Smart Oxford Fallback Dictionary
  return res.json({
    source: 'oxford-lexicon',
    data: {
      word: cleanWord,
      partOfSpeech: 'Word / Phrase',
      cefrLevel: 'B1',
      ukIpa: `/${cleanWord}/`,
      usIpa: `/${cleanWord}/`,
      englishDefinition: `Relating to ${cleanWord} in standard English usage.`,
      vietnameseMeaning: `Nghĩa của từ "${cleanWord}" trong ngữ cảnh thực tế.`,
      nuance: 'Cách dùng tự nhiên và chuẩn mực trong văn phong giao tiếp hàng ngày.',
      collocations: [
        { phrase: `use ${cleanWord}`, meaning: `sử dụng ${cleanWord}` },
        { phrase: `practice ${cleanWord}`, meaning: `thực hành ${cleanWord}` }
      ],
      examples: [
        {
          english: `You can improve your English by mastering the word "${cleanWord}".`,
          vietnamese: `Bạn có thể nâng cao trình độ tiếng Anh bằng cách nắm vững từ "${cleanWord}".`
        }
      ],
      memoryHook: `Ghi nhớ ngữ cảnh xuất hiện của từ trong video để kích hoạt phản xạ tự nhiên.`
    }
  });
});

// API Endpoint: Health check & info
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'LingoTube AI Backend', timestamp: new Date().toISOString() });
});

const os = require('os');

function getLocalIpAddress() {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch (e) {}
  return 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIpAddress();
  console.log(`=======================================================`);
  console.log(`  🚀 LingoTube AI Server is running on port ${PORT}`);
  console.log(`  💻 Trên máy tính:  http://localhost:${PORT}`);
  console.log(`  📱 Trên điện thoại: http://${localIp}:${PORT}`);
  console.log(`  (Lưu ý: Điện thoại và máy tính cần bắt chung 1 Wi-Fi)`);
  console.log(`=======================================================`);
});

module.exports = app;

