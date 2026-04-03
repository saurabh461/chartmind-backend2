const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
app.use(cors({ origin: '*' }));

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: { error: 'Rate limit reached. Please try again later.' }
});
app.use('/api/', limiter);

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const GEMINI_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
].filter(Boolean);

async function callGemini(parts, maxTokens = 900, temp = 0.3) {
  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const key = GEMINI_KEYS[i];
    const r = await fetch(`${GEMINI_URL}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: temp }
      })
    });

    const data = await r.json().catch(() => ({}));

    if (r.status === 429) {
      // Extract wait time, default 20s, then try next key
      const match = data?.error?.message?.match(/retry in ([\d.]+)s/i);
      const wait = match ? Math.ceil(parseFloat(match[1])) * 1000 : 20000;
      console.log(`Key ${i+1} quota hit, waiting ${wait}ms then trying next key`);
      await new Promise(res => setTimeout(res, wait));
      continue; // try next key
    }

    if (!r.ok) {
      console.error('Gemini error:', r.status, JSON.stringify(data?.error));
      throw new Error(data?.error?.message || `Gemini API error ${r.status}`);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini');
    return text;
  }
  throw new Error('Please wait 30 seconds and try again.');
}

app.get('/', (req, res) => res.json({ status: 'ChartMind AI running ✓', version: '1.0.0' }));

app.post('/api/analyse', async (req, res) => {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ error: 'Server configuration error. Contact @flowmindaii on Instagram.' });

    const { imageBase64, imageMimeType, symbol, timeframe, context } = req.body;

    const prompt = `You are ChartMind AI, a technical analysis assistant for Indian retail traders. Analyse ${symbol || 'this chart'} on the ${timeframe || 'selected'} timeframe.${context ? ` Context: ${context}.` : ''}

Be concise but detailed. Use bullet points. No filler words.

## 🟢 BUY or 🔴 DON'T BUY
State clearly: BUY or DON'T BUY — then give 4-6 specific reasons WHY based purely on what you see in the chart.
- If BUY: explain exactly why — which pattern confirms it, which level held, what momentum shows, what the risk:reward looks like, where to enter, where to put stop loss, what target looks realistic.
- If DON'T BUY: explain exactly why not — what's wrong with the chart, what pattern signals weakness, what level failed, why the risk is too high right now, what needs to change before it becomes a buy.

## ⚡ Key Levels
- Resistance: [price]
- Support: [price]
- Stop loss zone: [price]
- Target zone: [price]

## 📊 What the Chart Says
3-4 bullets on patterns, trend, momentum, and indicators visible.

## ⚠️ Invalidation
One sentence: what price action would completely invalidate this analysis.

---
⚠️ Educational only. Not SEBI-registered financial advice. Do your own research.`;

    const parts = [];
    if (imageBase64) parts.push({ inline_data: { mime_type: imageMimeType || 'image/png', data: imageBase64 } });
    parts.push({ text: prompt });

    let analysis;
    try {
      analysis = await callGemini(parts, 900, 0.3);
    } catch (err) {
      return res.status(503).json({ error: err.message });
    }

    res.json({ analysis });

  } catch (err) {
    console.error('Analyse error:', err.message);
    res.status(500).json({ error: 'Server error. Please try again in a moment.' });
  }
});

app.post('/api/journal-insights', async (req, res) => {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ error: 'Server configuration error.' });

    const { trades } = req.body;
    if (!trades || trades.length < 3) return res.json({ insights: 'Add at least 3 trades to your journal to unlock AI insights about your trading patterns.' });

    const summary = trades.slice(0, 50).map(t =>
      `${(t.date || '').split('T')[0]} | ${t.symbol || '?'} | ${t.direction || '?'} | Entry:${t.entry || '?'} Exit:${t.exit || 'open'} | P&L:₹${t.pnl || 'N/A'} | Setup:${t.setup || '?'} | Notes:${t.notes || ''}`
    ).join('\n');

    const parts = [{ text: `You are a trading coach analysing a retail Indian trader's journal. Be direct and genuinely useful. Find patterns: best instruments, worst setups, time-of-day tendencies, emotional patterns in notes, position sizing habits. Give 4-5 specific, actionable insights. Under 300 words.\n\nTrades:\n${summary}` }];

    let insights;
    try {
      insights = await callGemini(parts, 800, 0.5);
    } catch (err) {
      return res.status(503).json({ error: err.message });
    }
    res.json({ insights });

  } catch (err) {
    console.error('Insights error:', err.message);
    res.status(500).json({ error: 'Server error. Try again.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ChartMind AI backend running on port ${PORT}`));
