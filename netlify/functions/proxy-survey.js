const TARGET_ENV_MAP = {
  'misconception-pre': {
    envKeys: ['MISCONCEPTION_PRE_API', 'VITE_MISCONCEPTION_PRE_API'],
    label: '오개념 사전'
  },
  'misconception-post': {
    envKeys: ['MISCONCEPTION_POST_API', 'VITE_MISCONCEPTION_POST_API'],
    label: '오개념 사후'
  },
  'motivation-pre': {
    envKeys: ['MOTIVATION_PRE_API', 'VITE_MOTIVATION_PRE_API'],
    label: '동기 사전'
  },
  'motivation-post': {
    envKeys: ['MOTIVATION_POST_API', 'VITE_MOTIVATION_POST_API'],
    label: '동기 사후'
  },
  'task-pre': {
    envKeys: ['TASK_PERSISTENCE_PRE_API', 'VITE_TASK_PERSISTENCE_PRE_API'],
    label: '과제집착 사전'
  },
  'task-post': {
    envKeys: ['TASK_PERSISTENCE_POST_API', 'VITE_TASK_PERSISTENCE_POST_API'],
    label: '과제집착 사후'
  }
};

function resolveTarget(target) {
  const info = TARGET_ENV_MAP[target];
  if (!info) return { info: null, key: null, url: null };

  for (const key of info.envKeys) {
    if (process.env[key]) {
      return { info, key, url: process.env[key] };
    }
  }

  return { info, key: info.envKeys[0], url: null };
}

function truncate(value, max = 260) {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function tryParseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function looksLikeAppsScriptExecUrl(url) {
  return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(\?.*)?$/i.test(url || '');
}

function extractHtmlTitle(html) {
  const match = String(html || '').match(/<title>(.*?)<\/title>/i);
  return match ? match[1].trim() : '';
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, message: 'Method Not Allowed' })
    };
  }

  const target = event.queryStringParameters?.target;
  console.log('[proxy-survey] target:', target || '(none)');

  const resolved = resolveTarget(target);
  if (!resolved.info) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, message: '유효하지 않은 target 값입니다.' })
    };
  }

  console.log('[proxy-survey] env key:', resolved.key, 'exists:', Boolean(resolved.url));

  if (!resolved.url) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        message: `target=${target} (${resolved.info.label}) 에 대한 환경변수가 설정되지 않았습니다.`
      })
    };
  }

  if (!looksLikeAppsScriptExecUrl(resolved.url)) {
    console.warn('[proxy-survey] url format warning target:', target, 'env key:', resolved.key);
  }

  try {
    const forwardParams = new URLSearchParams(event.queryStringParameters || {});
    forwardParams.delete('target');
    const requestUrl = forwardParams.toString() ? `${resolved.url}?${forwardParams.toString()}` : resolved.url;

    const response = await fetch(requestUrl, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store'
    });

    const contentType = response.headers.get('content-type') || 'unknown';
    const rawText = await response.text();
    const snippet = truncate(rawText);

    console.log('[proxy-survey] upstream status:', response.status, 'content-type:', contentType);
    console.log('[proxy-survey] upstream snippet:', snippet);

    const parsed = tryParseJson(rawText);
    const isHtmlLike =
      /text\/html/i.test(contentType) ||
      /^\s*<!doctype html/i.test(rawText) ||
      /^\s*<html/i.test(rawText);
    const htmlTitle = isHtmlLike ? extractHtmlTitle(rawText) : '';

    if (!response.ok) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: true,
          target,
          message: `${resolved.info.label} 외부 API 호출 실패: status ${response.status}`,
          status: response.status,
          contentType,
          redirected: response.redirected,
          responseUrl: response.url,
          responsePreview: snippet
        })
      };
    }

    if (isHtmlLike) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: true,
          target,
          message: `${target} API가 JSON 대신 HTML 오류 페이지를 반환했습니다. Apps Script 웹앱 배포 URL 또는 접근 권한을 확인하세요.`,
          status: response.status,
          contentType,
          redirected: response.redirected,
          responseUrl: response.url,
          htmlTitle: htmlTitle || 'N/A',
          responsePreview: snippet
        })
      };
    }

    if (!parsed.ok) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: true,
          target,
          message: `${resolved.info.label} 응답 파싱 실패: ${parsed.error}`,
          status: response.status,
          contentType,
          redirected: response.redirected,
          responseUrl: response.url,
          responsePreview: snippet
        })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        data: parsed.value,
        meta: {
          target,
          envKey: resolved.key,
          status: response.status,
          contentType,
          redirected: response.redirected
        }
      })
    };
  } catch (error) {
    console.error('[proxy-survey] fetch error target:', target, 'message:', error?.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: true,
        target,
        message: '프록시 서버를 통해 데이터를 조회하는 중 오류가 발생했습니다.',
        details: error?.message || 'unknown error'
      })
    };
  }
};
