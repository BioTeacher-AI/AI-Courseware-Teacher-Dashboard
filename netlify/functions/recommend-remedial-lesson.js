const OpenAI = require('openai');

const MODEL_NAME = process.env.OPENAI_MODEL || 'gpt-5.4-nano';

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractFirstJsonObject(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return safeJsonParse(text.slice(start, end + 1));
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, message: 'Method Not Allowed' })
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, message: 'OpenAI API 환경변수가 설정되지 않았습니다.' })
    };
  }

  const payload = safeJsonParse(event.body || '{}');
  if (!payload || !payload.student) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, message: '요청 데이터가 올바르지 않습니다.' })
    };
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const systemPrompt = [
      '당신은 중학교 과학 수업을 돕는 교사용 교육 보조 AI입니다.',
      '학생에게 직접 지시하지 말고 교사에게 제안하는 어조로 작성하세요.',
      '입력 데이터(사전/사후 변화, 차시별 혼동 요약)에 근거해 1차시/2차시/3차시 보완 수업을 제안하세요.',
      '과도한 추측은 하지 말고 근거가 부족하면 판단 유보를 포함하세요.',
      '출력은 반드시 JSON 객체로 작성하세요.'
    ].join(' ');

    const userPrompt = {
      instruction: '학생별 보완 수업 차시를 교사에게 제안해 주세요.',
      output_format: {
        recommended_lessons: [
          {
            lesson: '1차시 | 2차시 | 3차시',
            topic: '관련 주제',
            reason: '데이터 기반 근거',
            teaching_suggestion: '교사가 수업에서 적용할 수 있는 제안'
          }
        ],
        summary: '전체 요약(교사 제안형 어조)'
      },
      student_data: payload
    };

    const response = await client.responses.create({
      model: MODEL_NAME,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: systemPrompt }]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: JSON.stringify(userPrompt) }]
        }
      ],
      max_output_tokens: 700
    });

    const outputText = response.output_text || '';
    const parsed = extractFirstJsonObject(outputText);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        model: MODEL_NAME,
        recommendation: parsed || null,
        raw_text: parsed ? '' : outputText
      })
    };
  } catch (error) {
    console.error('[recommend-remedial-lesson] openai error:', error?.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        message: 'AI 추천을 불러오지 못했습니다.'
      })
    };
  }
};
