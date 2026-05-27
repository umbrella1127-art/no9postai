export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const https = await import('https');
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbz2POEJjfOKuT57CHInwN8ZTlyiqbB4JmOt83B4qx7DV_a2CdoQQJQiSKdoOE8atceT/exec';

  function httpsGet(url, count) {
    count = count || 0;
    if (count > 10) return Promise.reject(new Error('リダイレクト上限'));
    return new Promise(function(resolve, reject) {
      https.default.get(url, function(response) {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          resolve(httpsGet(response.headers.location, count + 1));
          return;
        }
        let data = '';
        response.on('data', function(chunk) { data += chunk; });
        response.on('end', function() { resolve(data); });
      }).on('error', reject);
    });
  }

  function httpsPost(url, bodyStr, count) {
    count = count || 0;
    if (count > 10) return Promise.reject(new Error('リダイレクト上限'));
    return new Promise(function(resolve, reject) {
      const parsed = new URL(url);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr)
        }
      };
      const req2 = https.default.request(options, function(response) {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          resolve(httpsPost(response.headers.location, bodyStr, count + 1));
          return;
        }
        let data = '';
        response.on('data', function(chunk) { data += chunk; });
        response.on('end', function() { resolve(data); });
      });
      req2.on('error', reject);
      req2.write(bodyStr);
      req2.end();
    });
  }

  try {
    const params = req.method === 'POST' ? (req.body || {}) : (req.query || {});
    const action = params.action || '';
    const HEAVY  = ['analyzeImages', 'generatePosts'];
    let resultText;

    if (req.method === 'POST' && HEAVY.indexOf(action) !== -1) {
      resultText = await httpsPost(GAS_URL, JSON.stringify(params));
    } else if (req.method === 'POST') {
      resultText = await httpsPost(GAS_URL, JSON.stringify(params));
    } else {
      const queryStr = Object.keys(params).map(function(k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }).join('&');
      resultText = await httpsGet(GAS_URL + '?' + queryStr);
    }

    if (resultText.trim().startsWith('<')) {
      res.status(500).json({ error: 'GASの設定を確認してください' });
      return;
    }

    res.status(200).json(JSON.parse(resultText));

  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}
