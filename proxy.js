const https = require('https');

const GAS_URL = 'https://script.google.com/macros/s/AKfycbz2POEJjfOKuT57CHInwN8ZTlyiqbB4JmOt83B4qx7DV_a2CdoQQJQiSKdoOE8atceT/exec';

function httpsGet(url, redirectCount) {
  redirectCount = redirectCount || 0;
  if (redirectCount > 10) return Promise.reject(new Error('リダイレクト上限'));
  return new Promise(function(resolve, reject) {
    https.get(url, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(httpsGet(res.headers.location, redirectCount + 1));
        return;
      }
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() { resolve(data); });
    }).on('error', reject);
  });
}

function httpsPost(url, bodyStr, redirectCount) {
  redirectCount = redirectCount || 0;
  if (redirectCount > 10) return Promise.reject(new Error('リダイレクト上限'));

  return new Promise(function(resolve, reject) {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };

    const req = https.request(options, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(httpsPost(res.headers.location, bodyStr, redirectCount + 1));
        return;
      }
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() { resolve(data); });
    });

    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

exports.handler = async function(event) {
  try {
    const params = event.queryStringParameters || {};
    const action = params.action || '';

    const HEAVY_ACTIONS = ['analyzeImages', 'generatePosts'];
    let resultText;

    if (HEAVY_ACTIONS.indexOf(action) !== -1) {
      const bodyObj = { action: action };
      if (params.data) {
        try { bodyObj.data = JSON.parse(params.data); }
        catch(e) { bodyObj.data = params.data; }
      }
      const bodyStr = JSON.stringify(bodyObj);
      resultText = await httpsPost(GAS_URL, bodyStr);
    } else {
      const queryStr = Object.keys(params).map(function(k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }).join('&');
      resultText = await httpsGet(GAS_URL + '?' + queryStr);
    }

    if (resultText.trim().startsWith('<')) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'GASの設定を確認してください' })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: resultText
    };

  } catch(err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};