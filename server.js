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
  message: { error: 'Rate limit reached. Free tier allows 50 analyses per hour. Please try again later.' }
});
app.use('/api/', limiter);

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent';

app.get('/', (req, res) => res.json({ status: 'ChartMind AI running ✓', version: '1.0.0' }));

app.post('/api/analyse', async (req, res) => {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ error: 'Server configuration error. Contact @flowmindaii on Instagram.' });

    const { imageBase64, imageMimeType, symbol, timeframe, context } = req.body;

    const prompt = `You are ChartMind AI — a professional technical analysis assistant for Indian retail traders.
Analyse this trading chart for ${symbol || 'the instrument'} on the ${timeframe || 'selected'} timeframe.

## 📊 Pattern Recognition
What chart patterns are visible? (support/resistance, trend lines, candlestick patterns, formations)

## 📈 Trend & Momentum
Current trend direction? Is momentum strengthening or weakening?

## ⚡ Key Levels
Critical support and resistance levels with approximate prices.

## 📉 Indicators
Any visible indicators (RSI, MACD, MAs, Volume, BB) and what they show.

## 🎯 What to Watch
Key areas and scenarios — what does a bullish breakout vs bearish breakdown look like from here?

## ⚠️ Risk Notes
Key risks and chart invalidation points.

---
⚠️ **Disclaimer**: Educational analysis only. Not financial advice. Not SEBI registered. Always do your own research.
${context ? `\nContext: ${context}` : ''}`;

    const parts = [];
    if (imageBase64) parts.push({ inline_data: { mime_type: imageMimeType || 'image/png', data: imageBase64 } });
    parts.push({ text: prompt });

    const r = await fetch(`${GEMINI_URL}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { maxOutputTokens: 1500, temperature: 0.4 } })
    });

    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      if (r.status === 429) return res.status(429).json({ error: 'AI service is busy. Please wait a moment and try again.' });
      return res.status(502).json({ error: e?.error?.message || 'AI service error. Try again.' });
    }

    const data = await r.json();
    const analysis = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!analysis) return res.status(502).json({ error: 'Empty AI response. Please try again.' });
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

    const r = await fetch(`${GEMINI_URL}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { maxOutputTokens: 800, temperature: 0.5 } })
    });

    if (!r.ok) return res.status(502).json({ error: 'AI service error. Try again.' });
    const data = await r.json();
    const insights = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!insights) return res.status(502).json({ error: 'Empty response. Try again.' });
    res.json({ insights });

  } catch (err) {
    console.error('Insights error:', err.message);
    res.status(500).json({ error: 'Server error. Try again.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ChartMind AI backend running on port ${PORT}`));
