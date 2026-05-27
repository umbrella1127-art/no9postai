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
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_API_KEY;

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

  function httpsPostJson(url, bodyObj) {
    return new Promise(function(resolve, reject) {
      const bodyStr = JSON.stringify(bodyObj);
      const parsed  = new URL(url);
      const options = {
        hostname: parsed.hostname,
        path:     parsed.pathname + parsed.search,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(bodyStr)
        }
      };
      const req2 = https.default.request(options, function(response) {
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

    // 画像解析：Gemini APIを直接呼ぶ
    if (action === 'analyzeImages') {
      const data   = typeof params.data === 'string' ? JSON.parse(params.data) : params.data;
      const images = data.images || [];
      // 画像を圧縮（base64の先頭500000文字に制限）
const compressedImages = images.map(function(img) {
  return {
    mimeType: img.mimeType,
    base64: img.base64.substring(0, 500000)
  };
});
      const prompt = 'あなたは美容業界専門AIです。画像を解析し、以下をJSON形式で返してください。{"reaction":"","features":[],"hashtags":[],"recommendedTastes":[]}ルール：reaction：スタッフが嬉しくなる自然な褒めコメント。features：画像特徴候補。hashtags：おすすめハッシュタグ。recommendedTastes：おすすめ投稿テイスト。投稿テイスト候補：上品・共感・かわいい・強セールス・トレンド。JSONのみ返してください。';
      const parts  = [{ text: prompt }];
      images.forEach(function(img) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
      });
      const payload  = { contents: [{ role: 'user', parts: parts }], generationConfig: { temperature: 0.7, maxOutputTokens: 2048 } };
      const resultText = await httpsPostJson(GEMINI_URL, payload);
      const json     = JSON.parse(resultText);
      if (!json.candidates || !json.candidates.length) {
        res.status(500).json({ error: 'Gemini APIエラー: ' + resultText });
        return;
      }
      const text    = json.candidates[0].content.parts[0].text;
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      res.status(200).json(JSON.parse(cleaned));
      return;
    }

    // 投稿生成：Gemini APIを直接呼ぶ
    if (action === 'generatePosts') {
      const data   = typeof params.data === 'string' ? JSON.parse(params.data) : params.data;
      const images = data.images || [];

      // GASから店舗設定を取得
      let storeSettings = null;
      try {
        const ssText = await httpsGet(GAS_URL + '?action=getStoreSettings&storeKey=' + encodeURIComponent(data.store));
        if (!ssText.trim().startsWith('<')) storeSettings = JSON.parse(ssText);
      } catch(e) {}

      const prompt = `あなたは美容業界専門のAI投稿ディレクターです。

目的は、同じ画像・同じ内容から、Instagram、ホットペッパーブログ、Googleビジネスプロフィールの3媒体に最適化した投稿文を作ることです。

Markdown記法は禁止。** や ### や #見出しは禁止。箇条書き記号は禁止。

各媒体の区切りは必ず
===INSTAGRAM===
===HOTPEPPER===
===GOOGLE===
を使ってください。

【店舗名】
${data.store}

【カテゴリ】
${data.category}

【画像から選ばれた特徴】
${(data.features || []).join('、')}

【ハッシュタグ候補】
${(data.hashtags || []).join(' ')}

【投稿テイスト】
${data.taste}

【文章量】
${data.lengthType}

【追加内容】
${data.additionalText || ''}

${storeSettings ? `【店舗ブランドトーン】
${storeSettings.brandTone}

【店舗ターゲット】
${storeSettings.target}

【店舗の強み】
${storeSettings.strength}

【店舗NG表現】
${storeSettings.ngWords}

【Instagram投稿トーン指示】
${storeSettings.instagramTone}

【ホットペッパーブログ投稿トーン指示】
${storeSettings.hotpepperTone}

【Googleビジネスプロフィール投稿トーン指示】
${storeSettings.gbpTone}

【締めのCTA】
${storeSettings.cta}` : ''}

【共通ルール】
医療効果の断定は禁止。薬機法・景品表示法に配慮する。

【Instagramルール】
絵文字は各段落に1〜2個使う。共感から入る。最後にハッシュタグ10〜18個。

【ホットペッパーブログルール】
絵文字禁止。タイトル必須（30文字以内）。予約につながる内容。

【Googleビジネスプロフィールルール】
短め。ハッシュタグ・絵文字禁止。地域名・店舗名・サービス名を自然に入れる。

【文章量目安】
短め：Instagram300/HPB400/Google180文字前後
標準：Instagram500/HPB600/Google250文字前後
長め：Instagram700/HPB800/Google350文字前後

【出力形式】
===INSTAGRAM===
本文

===HOTPEPPER===
タイトル
本文

===GOOGLE===
本文`;

      const parts = [{ text: prompt }];
      images.forEach(function(img) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
      });
      const payload    = { contents: [{ role: 'user', parts: parts }], generationConfig: { temperature: 0.85, maxOutputTokens: 4096 } };
      const resultText = await httpsPostJson(GEMINI_URL, payload);
      const json       = JSON.parse(resultText);
      if (!json.candidates || !json.candidates.length) {
        res.status(500).json({ error: 'Gemini APIエラー: ' + resultText });
        return;
      }
      const result = json.candidates[0].content.parts[0].text.replace(/\*\*/g, '').replace(/###/g, '').trim();
      res.status(200).json(result);
      return;
    }

    // その他はGASへGETで転送
    const queryStr = Object.keys(params).map(function(k) {
      const v = typeof params[k] === 'object' ? JSON.stringify(params[k]) : String(params[k]);
      return encodeURIComponent(k) + '=' + encodeURIComponent(v);
    }).join('&');
    const resultText = await httpsGet(GAS_URL + (queryStr ? '?' + queryStr : ''));

    if (!resultText || resultText.trim().startsWith('<')) {
      res.status(500).json({ error: 'GASの設定を確認してください' });
      return;
    }

    res.status(200).json(JSON.parse(resultText));

  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}
