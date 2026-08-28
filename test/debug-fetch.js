const http = require('http');

async function testFetch(videoId) {
  console.log(`Testing transcript fetch for videoId: ${videoId}`);
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+100; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg'
  };

  try {
    const res = await fetch(watchUrl, { headers });
    const html = await res.text();
    console.log('Watch page response status:', res.status, 'HTML length:', html.length);
    
    // Check for captions in HTML
    const captionsMatch = html.match(/"captionTracks":\s*(\[.*?\])/s);
    console.log('Direct captionTracks match in HTML:', captionsMatch ? 'FOUND' : 'NOT FOUND');
    if (captionsMatch) {
      console.log('CaptionTracks preview:', captionsMatch[1].slice(0, 200));
    }

    // Try InnerTube with WEB client
    const innerTubeRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': headers['User-Agent'],
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': '2.20240401.01.00'
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240401.01.00',
            hl: 'en',
            gl: 'US'
          }
        },
        videoId: videoId
      })
    });
    console.log('InnerTube WEB status:', innerTubeRes.status);
    const innerData = await innerTubeRes.json();
    console.log('InnerTube captions present:', !!(innerData && innerData.captions));
    if (innerData && innerData.captions) {
      console.log('InnerTube captionTracks count:', (innerData.captions.playerCaptionsTracklistRenderer?.captionTracks || []).length);
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testFetch('UF8uR6Z6KLc');
