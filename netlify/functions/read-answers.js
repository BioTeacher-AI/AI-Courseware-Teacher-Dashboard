exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, message: 'Method Not Allowed' })
    };
  }

  const targetUrl = process.env.GOOGLE_SCRIPT_READ_URL;

  if (!targetUrl) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        message: 'GOOGLE_SCRIPT_READ_URL 환경변수가 설정되지 않았습니다.'
      })
    };
  }

  try {
    const params = new URLSearchParams(event.queryStringParameters || {});
    const requestUrl = params.toString() ? `${targetUrl}?${params.toString()}` : targetUrl;

    const response = await fetch(requestUrl, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store'
    });

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
    console.error('read-answers function error:', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        message: '학생 답안을 불러오는 중 서버 오류가 발생했습니다.',
        error: error.message
      })
    };
  }
};
