// services/groqService.js - Groq AI service for strategy parsing
const Groq = require('groq-sdk');

class GroqService {
  constructor() {
    this.client = null;
    this.isInitialized = false;
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.rateLimitDelay = 2000; // 2 seconds between requests
    this.lastRequestTime = 0;
  }

  async initialize() {
    try {
      this.client = new Groq({
        apiKey: process.env.GROQ_API_KEY,
      });
      this.isInitialized = true;
      console.log('✅ Groq service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Groq:', error);
      throw error;
    }
  }

  // Rate-limited request wrapper
  async makeGroqRequest(requestFunction) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ requestFunction, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) return;

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const { requestFunction, resolve, reject } = this.requestQueue.shift();

      try {
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        if (timeSinceLastRequest < this.rateLimitDelay) {
          await new Promise((r) => setTimeout(r, this.rateLimitDelay - timeSinceLastRequest));
        }

        const result = await requestFunction();
        this.lastRequestTime = Date.now();
        resolve(result);
      } catch (error) {
        console.error('Groq request error:', error.message);

        if (error.message.includes('rate limit') || error.status === 429) {
          console.log('⏱️ Rate limit hit, waiting 10 seconds...');
          await new Promise((r) => setTimeout(r, 10000));
          this.requestQueue.unshift({ requestFunction, resolve, reject });
        } else {
          reject(error);
        }
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    this.isProcessingQueue = false;
  }

  async parseStrategy(strategyText) {
    if (!this.isInitialized) throw new Error('Groq service not initialized');

    const prompt = `
Parse this trading strategy and return ONLY valid JSON:

Strategy: "${strategyText}"

Return this exact format:
{
  "strategy_type": "technical",
  "indicators": ["RSI", "Volume"],
  "entry_conditions": "conditions here",
  "exit_conditions": "conditions here",
  "risk_management": "rules here",
  "timeframe": "15m",
  "assets": ["ETH", "TOSHI"],
  "base_ecosystem_focus": true,
  "confidence": 8,
  "actionable": true,
  "suggested_base_tokens": ["ETH", "TOSHI", "DEGEN"]
}

Replace values based on the strategy. No markdown, no extra text.
`;

    return await this.makeGroqRequest(async () => {
      const completion = await this.client.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a trading strategy expert. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.1,
        max_tokens: 800,
      });

      const response = completion.choices[0]?.message?.content;
      return this.cleanAndParseJSON(response);
    });
  }

  cleanAndParseJSON(response) {
    try {
      let cleanResponse = response;

      if (response.includes('```json')) {
        cleanResponse = response.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
      }
      if (response.includes('```')) {
        cleanResponse = cleanResponse.replace(/```/g, '');
      }

      const firstBrace = cleanResponse.indexOf('{');
      const lastBrace = cleanResponse.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanResponse = cleanResponse.substring(firstBrace, lastBrace + 1);
      }

      cleanResponse = cleanResponse
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/"\s*,\s*"/g, '", "')
        .replace(/:\s*,/g, ': null,')
        .replace(/:\s*}/g, ': null}')
        .trim();

      return JSON.parse(cleanResponse);
    } catch (parseError) {
      console.error('JSON parse error:', parseError.message);
      console.error('Raw response:', response);
      return this.extractBasicJSON(response);
    }
  }

  extractBasicJSON(response) {
    console.log('🔧 Attempting basic JSON extraction...');

    if (response.includes('strategy_type') || response.includes('indicators')) {
      return {
        strategy_type: 'technical',
        indicators: ['Volume', 'Price'],
        entry_conditions: 'Based on strategy analysis',
        exit_conditions: 'Profit target reached',
        risk_management: 'Standard risk management',
        timeframe: '15m',
        assets: ['ETH', 'TOSHI', 'DEGEN'],
        base_ecosystem_focus: true,
        confidence: 7,
        actionable: true,
        suggested_base_tokens: ['ETH', 'TOSHI', 'DEGEN'],
      };
    }

    if (response.includes('signal') || response.includes('BUY') || response.includes('SELL')) {
      const signals = ['BUY', 'SELL', 'HOLD'];
      let detectedSignal = 'HOLD';
      for (const signal of signals) {
        if (response.toUpperCase().includes(signal)) {
          detectedSignal = signal;
          break;
        }
      }

      return {
        signal: detectedSignal,
        confidence: Math.floor(Math.random() * 5) + 4,
        reason: 'Analysis based on market conditions',
        entry_price: 1,
        stop_loss: detectedSignal === 'BUY' ? 0.95 : 1.05,
        take_profit: detectedSignal === 'BUY' ? 1.10 : 0.90,
        risk_reward_ratio: 2.0,
      };
    }

    throw new Error('Unable to extract valid JSON from Groq response');
  }

  async analyzeMarketConditions(marketData, strategy) {
    if (!this.isInitialized) throw new Error('Groq service not initialized');

    const prompt = `
Analyze market data and generate a trading signal. 

Market Data: ${JSON.stringify(marketData)}
Strategy: ${JSON.stringify(strategy)}

Return ONLY this exact JSON format with actual numbers:
{
  "signal": "BUY",
  "confidence": 7,
  "reason": "explanation here",
  "entry_price": ${marketData.price || 1},
  "stop_loss": ${(marketData.price || 1) * 0.95},
  "take_profit": ${(marketData.price || 1) * 1.10},
  "risk_reward_ratio": 2.0
}

Replace values based on analysis. Use BUY, SELL, or HOLD. No markdown, no extra text.
`;

    return await this.makeGroqRequest(async () => {
      const completion = await this.client.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a trading signal generator. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.2,
        max_tokens: 600,
      });

      const response = completion.choices[0]?.message?.content;
      const parsed = this.cleanAndParseJSON(response);

      const price = marketData.price || 1;

      parsed.stop_loss = typeof parsed.stop_loss === 'string' ? price * 0.95 : parsed.stop_loss || price * 0.95;
      parsed.take_profit = typeof parsed.take_profit === 'string' ? price * 1.10 : parsed.take_profit || price * 1.10;
      parsed.risk_reward_ratio = typeof parsed.risk_reward_ratio === 'string' ? 2.0 : parsed.risk_reward_ratio || 2.0;
      parsed.entry_price = parsed.entry_price || price;

      return parsed;
    });
  }

  async generateTradingInsight(symbol, timeframe = '1h') {
    const prompt = `
Generate a brief trading insight for ${symbol} on ${timeframe} timeframe.
Include:
- Current market sentiment
- Key levels to watch
- Potential opportunities
- Risk factors

Keep it concise and actionable for crypto traders.
`;

    return await this.makeGroqRequest(async () => {
      const completion = await this.client.chat.completions.create({
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: 'llama-3.1-8b-instant',
        temperature: 0.3,
        max_tokens: 250,
      });

      return completion.choices[0]?.message?.content;
    });
  }
}

module.exports = new GroqService();
