export default async function handler(req, res) {
  // Allow requests from anywhere (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  let targetUrl = req.query.url;
  const songId = req.query.id;

  // 1. If an ID is provided instead of a URL, fetch the hlsUrl automatically
  if (!targetUrl && songId) {
    try {
      const streamRes = await fetch(`https://gaanaayush.vercel.app/api/stream/${songId}`);
      if (!streamRes.ok) {
        return res.status(streamRes.status).json({
          success: false,
          error: `Failed to fetch stream data for ID ${songId}`
        });
      }
      const streamJson = await streamRes.json();
      targetUrl = streamJson?.data?.hlsUrl;
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Failed to resolve ID to stream URL' });
    }
  }

  // 2. Validate target URL
  if (!targetUrl) {
    return res.status(400).json({
      success: false,
      message: 'Missing "url" or "id" parameter.',
      example_1: '/api/token?url=https://vodhlsgaana-ebw.akamaized.net/.../128.mp4.master.m3u8?...',
      example_2: '/api/token?id=65632806'
    });
  }

  try {
    // 3. Fetch Master M3U8
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `Failed to fetch M3U8. HTTP Status: ${response.status}`
      });
    }

    const content = await response.text();
    const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

    let subPlaylistUrl = '';

    // 4. Extract variant sub-playlist (index.m3u8)
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#EXT-X-STREAM-INF:')) {
        let next = lines[++i];
        while (next && next.startsWith('#')) next = lines[++i];
        if (next) {
          subPlaylistUrl = new URL(next.replace(/^["']|["']$/g, ''), targetUrl).href;
          break;
        }
      }
    }

    // Fallback if not an explicit STREAM-INF tag
    if (!subPlaylistUrl) {
      for (const line of lines) {
        if (!line.startsWith('#') && line.includes('.m3u8')) {
          subPlaylistUrl = new URL(line, targetUrl).href;
          break;
        }
      }
    }

    if (!subPlaylistUrl) {
      return res.status(404).json({
        success: false,
        error: 'No variant playlist or index.m3u8 URL found.'
      });
    }

    // 5. Extract Token (hdntl=... or hdnts=...)
    const tokenMatch = subPlaylistUrl.match(/(hdnt[a-z]=[^/&\s]+)/i);
    const token = tokenMatch ? tokenMatch[1] : null;

    // 6. Return JSON response
    return res.status(200).json({
      success: true,
      token: token,
      url: subPlaylistUrl
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
