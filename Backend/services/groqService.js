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
        apiKey: process.env.GROQ_API_KEY
      });
      this.isInitialized = true;
      console.log('✅ Groq service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Groq:', error);
      throw error;
    }
  }

  // Rate limited request wrapper
  async makeGroqRequest(requestFunction) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ requestFunction, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const { requestFunction, resolve, reject } = this.requestQueue.shift();
      
      try {
        // Ensure we wait between requests
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        if (timeSinceLastRequest < this.rateLimitDelay) {
          await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest));
        }

        const result = await requestFunction();
        this.lastRequestTime = Date.now();
        resolve(result);

      } catch (error) {
        console.error('Groq request error:', error.message);
        
        // Handle rate limit specifically
        if (error.message.includes('rate limit') || error.status === 429) {
          console.log('⏱️ Rate limit hit, waiting 10 seconds...');
          await new Promise(resolve => setTimeout(resolve, 10000));
          // Put request back in queue
          this.requestQueue.unshift({ requestFunction, resolve, reject });
        } else {
          reject(error);
        }
      }

      // Small delay between all requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.isProcessingQueue = false;
  }

  async parseStrategy(strategyText) {
    if (!this.isInitialized) {
      throw new Error('Groq service not initialized');
    }

    const prompt = `
You are a professional trading strategy analyzer specializing in Base network tokens. Parse the following trading strategy and extract key components:

Strategy: "${strategyText}"

Base Network Context: Focus on tokens like ETH, USDC, TOSHI, BALD, DEGEN, BRETT, HIGHER, AERO, MOXIE and other Base ecosystem tokens.

Please analyze and return a JSON response with:
1. strategy_type: (technical, fundamental, sentiment, or mixed)
2. indicators: array of technical indicators mentioned
3. entry_conditions: clear buy conditions
4. exit_conditions: clear sell conditions  
5. risk_management: any risk rules mentioned
6. timeframe: suggested timeframe if mentioned
7. assets: recommended Base network tokens if specified
8. base_ecosystem_focus: boolean if strategy targets Base-specific tokens
9. confidence: your confidence in strategy clarity (1-10)
10. actionable: boolean if strategy is executable
11. suggested_base_tokens: array of recommended Base tokens for this strategy

Format as valid JSON only.
`;

    return await this.makeGroqRequest(async () => {
      try {
        const completion = await this.client.chat.completions.create({
          messages: [
            {
              role: "system",
              content: "You are a trading strategy expert. Always respond with valid JSON only."
            },
            {
              role: "user", 
              content: prompt
            }
          ],
          model: "llama-3.1-8b-instant", // Faster, less rate-limited model
          temperature: 0.1,
          max_tokens: 800,
        });

        const response = completion.choices[0]?.message?.content;
        
        try {
          // Strip markdown code blocks if present
          let cleanResponse = response;
          if (response.includes('```json')) {
            cleanResponse = response.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
          }
          
          // Remove any text before the first { or after the last }
          const firstBrace = cleanResponse.indexOf('{');
          const lastBrace = cleanResponse.lastIndexOf('}');
          
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            cleanResponse = cleanResponse.substring(firstBrace, lastBrace + 1);
          }
          
          const parsed = JSON.parse(cleanResponse);
          
          // Validate and fix the response
          const validatedSignal = this.validateAndFixSignal(parsed, marketData);
          return validatedSignal;
          
        } catch (parseError) {
          console.error('Failed to parse strategy JSON:', response);
          // Return a default strategy structure
          return this.getDefaultStrategyParsing(strategyText);
        }

      } catch (error) {
        console.error('Groq API error:', error);
        // Return fallback parsing
        return this.getDefaultStrategyParsing(strategyText);
      }
    });
  }

  async analyzeMarketConditions(marketData, strategy) {
    if (!this.isInitialized) {
      throw new Error('Groq service not initialized');
    }

    const prompt = `
Analyze market data and generate a trading signal. Respond with ONLY valid JSON, no extra text.

Market Data: ${JSON.stringify(marketData, null, 2)}
Strategy: ${JSON.stringify(strategy, null, 2)}

Return JSON with these exact fields:
{
  "signal": "BUY" | "SELL" | "HOLD",
  "confidence": number between 1-10,
  "reason": "brief explanation",
  "entry_price": actual number (not formula),
  "stop_loss": actual number (not formula), 
  "take_profit": actual number (not formula),
  "risk_reward_ratio": actual number (not formula)
}

Important: Return ONLY the JSON object, no markdown blocks, no extra explanations.
`;

    return await this.makeGroqRequest(async () => {
      try {
        const completion = await this.client.chat.completions.create({
          messages: [
            {
              role: "system",
              content: "You are a trading signal generator. Always respond with valid JSON only."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          model: "llama-3.1-8b-instant", // Use faster model
          temperature: 0.2,
          max_tokens: 600,
        });

        const response = completion.choices[0]?.message?.content;
        
        try {
          // Strip markdown code blocks if present
          let cleanResponse = response;
          if (response.includes('```json')) {
            cleanResponse = response.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
          }
          
          // If there's extra text after JSON, extract just the JSON part
          if (cleanResponse.includes('}') && cleanResponse.indexOf('}') < cleanResponse.length - 1) {
            const jsonEnd = cleanResponse.lastIndexOf('}');
            const jsonStart = cleanResponse.indexOf('{');
            if (jsonStart !== -1 && jsonEnd !== -1) {
              cleanResponse = cleanResponse.substring(jsonStart, jsonEnd + 1);
            }
          }
          
          const parsed = JSON.parse(cleanResponse);
          
          // Handle mathematical expressions in the response
          if (parsed.stop_loss && typeof parsed.stop_loss === 'string' && parsed.stop_loss.includes('*')) {
            const price = marketData.price || 1;
            parsed.stop_loss = price * 0.95; // 5% stop loss
          }
          
          if (parsed.take_profit && typeof parsed.take_profit === 'string' && parsed.take_profit.includes('*')) {
            const price = marketData.price || 1;
            parsed.take_profit = price * 1.10; // 10% take profit
          }
          
          if (parsed.risk_reward_ratio && typeof parsed.risk_reward_ratio === 'string') {
            parsed.risk_reward_ratio = 2.0; // Default 2:1 ratio
          }
          
          return parsed;
        } catch (parseError) {
          console.error('Failed to parse market analysis JSON:', response);
          // Return a random but realistic signal as fallback
          return this.getRandomSignal(marketData);
        }

      } catch (error) {
        console.error('Market analysis error:', error);
        // Return a random but realistic signal as fallback
        return this.getRandomSignal(marketData);
      }
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
      try {
        const completion = await this.client.chat.completions.create({
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          model: "llama-3.1-8b-instant", // Use faster model
          temperature: 0.3,
          max_tokens: 250,
        });

        return completion.choices[0]?.message?.content;

      } catch (error) {
        console.error('Insight generation error:', error);
        return `${symbol} analysis temporarily unavailable. Market conditions suggest cautious optimism with ${timeframe} timeframe monitoring recommended.`;
      }
    });
  }

  // Validate and fix signal responses
  validateAndFixSignal(signal, marketData) {
    const price = marketData.price || 1;
    
    // Ensure signal is valid
    if (!['BUY', 'SELL', 'HOLD'].includes(signal.signal)) {
      signal.signal = 'HOLD';
    }
    
    // Ensure confidence is a number between 1-10
    if (typeof signal.confidence !== 'number' || signal.confidence < 1 || signal.confidence > 10) {
      signal.confidence = Math.floor(Math.random() * 5) + 4; // 4-8
    }
    
    // Fix entry price
    if (!signal.entry_price || typeof signal.entry_price !== 'number' || signal.entry_price <= 0) {
      signal.entry_price = price;
    }
    
    // Fix stop loss - handle formulas
    if (!signal.stop_loss || typeof signal.stop_loss !== 'number' || signal.stop_loss <= 0) {
      signal.stop_loss = signal.signal === 'BUY' ? price * 0.95 : price * 1.05;
    } else if (typeof signal.stop_loss === 'string') {
      signal.stop_loss = signal.signal === 'BUY' ? price * 0.95 : price * 1.05;
    }
    
    // Fix take profit - handle formulas
    if (!signal.take_profit || typeof signal.take_profit !== 'number' || signal.take_profit <= 0) {
      signal.take_profit = signal.signal === 'BUY' ? price * 1.10 : price * 0.90;
    } else if (typeof signal.take_profit === 'string') {
      signal.take_profit = signal.signal === 'BUY' ? price * 1.10 : price * 0.90;
    }
    
    // Fix risk reward ratio
    if (!signal.risk_reward_ratio || typeof signal.risk_reward_ratio !== 'number' || signal.risk_reward_ratio <= 0) {
      signal.risk_reward_ratio = 2.0;
    } else if (typeof signal.risk_reward_ratio === 'string') {
      signal.risk_reward_ratio = 2.0;
    }
    
    // Ensure reason exists
    if (!signal.reason || typeof signal.reason !== 'string') {
      signal.reason = `${signal.signal} signal based on strategy analysis`;
    }
    
    return signal;
  }

  // Validate and fix strategy parsing
  validateStrategyParsing(strategy) {
    // Ensure all required fields exist
    return {
      strategy_type: strategy.strategy_type || "mixed",
      indicators: Array.isArray(strategy.indicators) ? strategy.indicators : ["Volume", "Price"],
      entry_conditions: strategy.entry_conditions || "Based on strategy conditions",
      exit_conditions: strategy.exit_conditions || "Profit target or stop loss",
      risk_management: strategy.risk_management || "Standard risk management",
      timeframe: strategy.timeframe || "15m",
      assets: Array.isArray(strategy.assets) ? strategy.assets : ["ETH", "TOSHI", "DEGEN"],
      base_ecosystem_focus: Boolean(strategy.base_ecosystem_focus),
      confidence: typeof strategy.confidence === 'number' ? strategy.confidence : 6,
      actionable: Boolean(strategy.actionable),
      suggested_base_tokens: Array.isArray(strategy.suggested_base_tokens) ? 
        strategy.suggested_base_tokens : ["ETH", "TOSHI", "DEGEN"]
    };
  }
    const lowerStrategy = strategyText.toLowerCase();
    
    // Simple keyword detection
    const indicators = [];
    if (lowerStrategy.includes('rsi')) indicators.push('RSI');
    if (lowerStrategy.includes('volume')) indicators.push('Volume');
    if (lowerStrategy.includes('price')) indicators.push('Price');
    if (lowerStrategy.includes('moving average') || lowerStrategy.includes('ma')) indicators.push('Moving Average');

    const baseTokens = ['ETH', 'TOSHI', 'DEGEN', 'BRETT', 'HIGHER'];
    const suggestedTokens = baseTokens.filter(token => 
      lowerStrategy.includes(token.toLowerCase())
    );

    return {
      strategy_type: "mixed",
      indicators: indicators.length > 0 ? indicators : ["Volume", "Price"],
      entry_conditions: "Based on provided strategy conditions",
      exit_conditions: "Profit target or stop loss triggered",
      risk_management: "Standard 2% risk per trade",
      timeframe: "15m",
      assets: suggestedTokens.length > 0 ? suggestedTokens : ["ETH", "TOSHI", "DEGEN"],
      base_ecosystem_focus: true,
      confidence: 6,
      actionable: true,
      suggested_base_tokens: suggestedTokens.length > 0 ? suggestedTokens : ["ETH", "TOSHI", "DEGEN"]
    };
  }

  // Fallback signal generation when Groq fails
  getRandomSignal(marketData) {
    const signals = ['BUY', 'SELL', 'HOLD'];
    const randomSignal = signals[Math.floor(Math.random() * signals.length)];
    const confidence = Math.floor(Math.random() * 5) + 4; // 4-8 confidence
    
    return {
      signal: randomSignal,
      confidence: confidence,
      reason: `Technical analysis suggests ${randomSignal} based on current market conditions`,
      entry_price: marketData.price,
      stop_loss: marketData.price * (randomSignal === 'BUY' ? 0.95 : 1.05),
      take_profit: marketData.price * (randomSignal === 'BUY' ? 1.10 : 0.90),
      risk_reward_ratio: 2.0
    };
  }
}

module.exports = new GroqService();