export default async function handler(req, res) {
  const https = await import('https');

  const GAS_URL = 'https://script.google.com/macros/s/AKfycbz2POEJjfOKuT57CHInwN8ZTlyiqbB4JmOt83B4qx7DV_a2CdoQQJQiSKdoOE8atceT/exec';

  function httpsGet(url, redirectCount) {
    redirectCount = redirectCount || 0;
    if (redirectCount > 10) return Promise.reject(new Error('リダイレクト上限'));
    return new Promise(function(resolve, reject) {
      https.default.get(url, function(response) {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          resolve(httpsGet(response.headers.location, redirectCount + 1));
          return;
        }
        let data = '';
        response.on('data', function(chunk) { data += chunk; });
        response.on('end', function() { resolve(data); });
      }).on('error', reject);
    });
  }

  try {
    const params = req.query || {};
    const action = params.action || '';

    const queryStr = Object.keys(params).map(function(k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');

    const resultText = await httpsGet(GAS_URL + '?' + queryStr);

    if (resultText.trim().startsWith('<')) {
      res.status(500).json({ error: 'GASの設定を確認してください' });
      return;
    }

    const data = JSON.parse(resultText);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);

  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}
