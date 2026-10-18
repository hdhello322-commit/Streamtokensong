export default async function handler(req, res) {
  // Allow requests from anywhere (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  // 1. Get the 'url' parameter from query string
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send('Error: Missing "url" parameter.\nUsage: /api/token?url=https://example.com/playlist.m3u8');
  }

  try {
    // 2. Fetch the M3U8 file
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      return res.status(response.status).send(`Failed to fetch M3U8. HTTP Status: ${response.status}`);
    }

    const content = await response.text();
    const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

    const extractedUrls = [];
    const uriRegex = /URI=["']([^"']+)["']/;

    // Helper to convert relative URLs to full URLs
    const resolve = (uri) => {
      try {
        const cleanUri = uri.replace(/^["']|["']$/g, '');
        return new URL(cleanUri, targetUrl).href;
      } catch (err) {
        return uri;
      }
    };

    // 3. Parse segments, variant streams, and keys
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Segment URLs (#EXTINF)
      if (line.startsWith('#EXTINF:')) {
        let next = lines[++i];
        while (next && next.startsWith('#')) next = lines[++i];
        if (next) extractedUrls.push(resolve(next));
      }
      // Master Variant Streams (#EXT-X-STREAM-INF)
      else if (line.startsWith('#EXT-X-STREAM-INF:')) {
        let next = lines[++i];
        while (next && next.startsWith('#')) next = lines[++i];
        if (next) extractedUrls.push(resolve(next));
      }
      // Init maps (#EXT-X-MAP)
      else if (line.startsWith('#EXT-X-MAP:')) {
        const match = line.match(uriRegex);
        if (match) extractedUrls.push(resolve(match[1]));
      }
      // Encryption Keys (#EXT-X-KEY)
      else if (line.startsWith('#EXT-X-KEY:')) {
        const match = line.match(uriRegex);
        if (match) extractedUrls.push(resolve(match[1]));
      }
      // Audio / Subtitles (#EXT-X-MEDIA)
      else if (line.startsWith('#EXT-X-MEDIA:')) {
        const match = line.match(uriRegex);
        if (match) extractedUrls.push(resolve(match[1]));
      }
    }

    if (extractedUrls.length === 0) {
      return res.status(200).send('No segment or stream URLs found in playlist.');
    }

    // 4. Return plain text lines
    return res.status(200).send(extractedUrls.join('\n'));

  } catch (error) {
    return res.status(500).send(`Server Error: ${error.message}`);
  }
}
