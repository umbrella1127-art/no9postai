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

  function fetchUrl(url, options, count) {
    count = count || 0;
    if (count > 10) return Promise.reject(new Error('リダイレクト上限'));

    return new Promise(function(resolve, reject) {
      const parsed = new URL(url);
      const reqOptions = Object.assign({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
      }, options);

      const request = https.default.request(reqOptions, function(response) {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          // リダイレクト後はGETで追従
          resolve(fetchUrl(response.headers.location, { method: 'GET' }, count + 1));
          return;
        }
        let data = '';
        response.on('data', function(chunk) { data += chunk; });
        response.on('end', function() { resolve(data); });
      });

      request.on('error', reject);

      if (options.body) {
        request.write(options.body);
      }
      request.end();
    });
  }

  try {
    const params = req.method === 'POST' ? (req.body || {}) : (req.query || {});
    const action = params.action || '';
    const HEAVY  = ['analyzeImages', 'generatePosts'];
    let resultText;

    if (req.method === 'POST' && HEAVY.indexOf(action) !== -1) {
      // 画像系はGASのdoGetにクエリパラメータで送る（dataだけ別途）
      // ただし大きすぎるのでdoPostを使う
      const bodyStr = JSON.stringify(params);
      resultText = await fetchUrl(GAS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr)
        },
        body: bodyStr
      });
    } else {
      const queryStr = Object.keys(params).map(function(k) {
        const v = typeof params[k] === 'object' ? JSON.stringify(params[k]) : String(params[k]);
        return encodeURIComponent(k) + '=' + encodeURIComponent(v);
      }).join('&');
      resultText = await fetchUrl(GAS_URL + (queryStr ? '?' + queryStr : ''), {
        method: 'GET'
      });
    }

    if (!resultText || resultText.trim().startsWith('<')) {
      res.status(500).json({ error: 'GASがHTMLを返しました。POSTは現在利用できません。画像なしで試してください。' });
      return;
    }

    res.status(200).json(JSON.parse(resultText));

  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}
