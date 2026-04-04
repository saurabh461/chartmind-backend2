const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
app.use(cors({ origin: '*' }));
app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many requests. Please wait a minute and try again.' }
}));

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
].filter(Boolean);

async function gemini(parts, maxTokens = 1000) {
  for (const key of KEYS) {
    const r = await fetch(`${GEMINI_URL}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 }
      })
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 429) continue; // try next key
    if (!r.ok) throw new Error(data?.error?.message || `Error ${r.status}`);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response');
    return text;
  }
  throw new Error('All keys are rate limited. Wait 1 minute and try again.');
}

app.get('/', (req, res) => res.json({ status: 'ChartMind AI v2 running' }));

app.post('/api/analyse', async (req, res) => {
  try {
    if (!KEYS.length) return res.status(500).json({ error: 'Server not configured.' });
    const { imageBase64, imageMimeType, symbol, timeframe, context } = req.body;

    const prompt = `You are ChartMind AI, an expert technical analyst for Indian retail traders on NSE/BSE.
Analyse the chart for ${symbol || 'this instrument'} on the ${timeframe || 'selected'} timeframe.${context ? ` Trader note: ${context}` : ''}

Respond in this EXACT format with these EXACT headings:

## VERDICT
State ONE of: 🟢 BUY or 🔴 DON'T BUY — then one sentence summary of why.

## WHY YOU ${imageBase64 ? '(based on chart)' : ''}
Give 5-6 specific bullet points.
- If BUY: exactly WHY to buy — which pattern confirmed entry, which level held as support, what the trend shows, what momentum/indicators confirm, where to enter, where to place stop loss, what target is realistic and why.
- If DON'T BUY: exactly WHY NOT — what is broken on the chart, which level failed, what pattern signals weakness or reversal, why risk is too high, what needs to happen before it becomes a buy setup.
Each bullet must be specific to what is visible on the chart. No vague statements.

## KEY LEVELS
- Entry zone: [price or range]
- Stop loss: [price] — [why this level]
- Target 1: [price] — [why this level]
- Target 2: [price if applicable]
- Key resistance: [price]
- Key support: [price]

## CHART READING
3-4 bullets on exactly what the chart shows — trend, candlestick patterns, indicator readings (RSI/MACD/MA/Volume if visible), chart formations.

## INVALIDATION
One sentence: the exact price action that would make this analysis wrong.

---
⚠️ Educational analysis only. Not SEBI-registered financial advice.`;

    const parts = [];
    if (imageBase64) parts.push({ inline_data: { mime_type: imageMimeType || 'image/png', data: imageBase64 } });
    parts.push({ text: prompt });

    const analysis = await gemini(parts, 1000);
    res.json({ analysis });
  } catch (err) {
    console.error('Analyse:', err.message);
    res.status(503).json({ error: err.message });
  }
});

app.post('/api/journal-insights', async (req, res) => {
  try {
    if (!KEYS.length) return res.status(500).json({ error: 'Server not configured.' });
    const { trades } = req.body;
    if (!trades?.length || trades.length < 3) {
      return res.json({ insights: 'Log at least 3 trades to unlock AI pattern analysis on your journal.' });
    }
    const summary = trades.slice(0, 50).map(t =>
      `${(t.date||'').split('T')[0]} | ${t.symbol||'?'} | ${t.direction||'?'} | Entry:${t.entry||'?'} Exit:${t.exit||'open'} | P&L:₹${t.pnl||'N/A'} | Setup:${t.setup||'?'} | Notes:${t.notes||''}`
    ).join('\n');

    const parts = [{ text: `Analyse this Indian retail trader's journal. Be direct and specific. Find: best/worst instruments, winning vs losing setups, time patterns, emotional patterns in notes, position sizing habits. Give 4-5 concrete actionable insights under 280 words.\n\nTrades:\n${summary}` }];
    const insights = await gemini(parts, 700);
    res.json({ insights });
  } catch (err) {
    console.error('Insights:', err.message);
    res.status(503).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ChartMind AI v2 on port ${PORT}`));
