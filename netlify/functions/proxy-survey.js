const TARGET_ENV_MAP = {
  'misconception-pre': ['MISCONCEPTION_PRE_API', 'VITE_MISCONCEPTION_PRE_API'],
  'misconception-post': ['MISCONCEPTION_POST_API', 'VITE_MISCONCEPTION_POST_API'],
  'motivation-pre': ['MOTIVATION_PRE_API', 'VITE_MOTIVATION_PRE_API'],
  'motivation-post': ['MOTIVATION_POST_API', 'VITE_MOTIVATION_POST_API'],
  'task-pre': ['TASK_PERSISTENCE_PRE_API', 'VITE_TASK_PERSISTENCE_PRE_API'],
  'task-post': ['TASK_PERSISTENCE_POST_API', 'VITE_TASK_PERSISTENCE_POST_API']
};

function resolveTargetUrl(target) {
  const candidates = TARGET_ENV_MAP[target] || [];
  for (const key of candidates) {
    if (process.env[key]) {
      return { key, url: process.env[key] };
    }
  }
  return { key: candidates[0] || null, url: null };
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

  if (!target || !TARGET_ENV_MAP[target]) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, message: '유효하지 않은 target 값입니다.' })
    };
  }

  const resolved = resolveTargetUrl(target);
  if (!resolved.url) {
    console.warn('[proxy-survey] missing env for target:', target, 'expected:', resolved.key);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, message: 'API 환경변수가 설정되지 않았습니다.' })
    };
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

    console.log('[proxy-survey] upstream status:', response.status, 'target:', target);

    const text = await response.text();
    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: text
    };
  } catch (error) {
    console.error('[proxy-survey] fetch error target:', target, 'message:', error?.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        message: '프록시 서버를 통해 데이터를 조회하는 중 오류가 발생했습니다.'
      })
    };
  }
};
