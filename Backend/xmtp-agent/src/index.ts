import { Client } from '@xmtp/xmtp-js'
import { Wallet } from 'ethers'
import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

class TradingAgent {
  private client: Client | null = null
  private wallet: Wallet | null = null
  private backendUrl: string

  constructor() {
    this.backendUrl = process.env.BACKEND_URL || 'http://localhost:3000'
  }

  async initialize() {
    try {
      console.log('🤖 Starting Trading Agent...')
      
      if (!process.env.XMTP_PRIVATE_KEY) {
        throw new Error('XMTP_PRIVATE_KEY environment variable required')
      }
      
      // Create wallet
      this.wallet = new Wallet(process.env.XMTP_PRIVATE_KEY)
      console.log(`🔑 Agent wallet: ${this.wallet.address}`)
      
      // Create XMTP client  
      this.client = await Client.create(this.wallet, { 
        env: 'production'
      })
      console.log('✅ XMTP client ready')
      
      // Registration check - ADD THIS PART
      try {
        // Try to create a conversation to register the agent
        const conversations = await this.client.conversations.list()
        console.log(`📋 Found ${conversations.length} existing conversations`)
        
        // If no conversations exist, we need to trigger registration
        if (conversations.length === 0) {
          console.log('🔄 Attempting to register agent on XMTP network...')
          // The agent will be registered when someone first messages it
          console.log('💡 Agent will be registered when it receives first message')
        } else {
          console.log('✅ Agent appears to be registered (has conversations)')
        }
      } catch (error) {
        console.log('⚠️ Registration check skipped:', error instanceof Error ? error.message : 'Unknown error')
      }
      
      // Start message listening
      this.startListening()
      
    } catch (error) {
      console.error('❌ Agent initialization failed:', error)
      process.exit(1)
    }
  }

  async startListening() {
    if (!this.client) return
    
    console.log('👂 Listening for XMTP messages...')
    console.log(`💬 Send messages to: ${this.wallet?.address}`)
    
    try {
      // Listen for all conversations
      const conversations = await this.client.conversations.list()
      
      // Listen to existing conversations
      for (const conversation of conversations) {
        this.handleConversation(conversation)
      }
      
      // Listen for new conversations
      const stream = await this.client.conversations.stream()
      for await (const conversation of stream) {
        console.log(`💬 New conversation: ${conversation.peerAddress}`)
        this.handleConversation(conversation)
      }
    } catch (error) {
      console.error('❌ Error starting message listener:', error instanceof Error ? error.message : 'Unknown error')
      console.log('🔄 Retrying in 5 seconds...')
      setTimeout(() => this.startListening(), 5000)
    }
  }

  async handleConversation(conversation: any) {
    try {
      console.log(`🔄 Handling conversation with ${conversation.peerAddress}`)
      
      // Listen for messages in this conversation
      const messageStream = await conversation.streamMessages()
      
      for await (const message of messageStream) {
        // Skip our own messages
        if (message.senderAddress === this.client?.address) continue
        
        console.log(`📨 ${message.senderAddress}: ${message.content}`)
        
        // Process the message
        const response = await this.processMessage(message.content, message.senderAddress)
        
        if (response) {
          await conversation.send(response)
          console.log(`🤖 Replied: ${response.substring(0, 50)}...`)
        }
      }
    } catch (error) {
      console.error('❌ Conversation error:', error instanceof Error ? error.message : 'Unknown error')
      console.log('🔄 Will retry on next message...')
    }
  }

  async processMessage(content: string, senderAddress: string): Promise<string> {
    const command = content.toLowerCase().trim()
    
    try {
      // Help command
      if (command.startsWith('/help') || command === 'help') {
        return this.getHelpMessage()
      }
      
      // Rounds command
      if (command.startsWith('/rounds')) {
        return await this.handleRounds()
      }
      
      // Strategy analysis
      if (command.startsWith('/strategy')) {
        const strategy = content.replace(/^\/strategy\s*/i, '').trim()
        return await this.handleStrategy(strategy)
      }
      
      // Signals
      if (command.startsWith('/signals')) {
        const symbol = command.split(' ')[1] || 'ETH'
        return await this.handleSignals(symbol)
      }
      
      // Mint command
      if (command.startsWith('/mint')) {
        return this.handleMint(senderAddress)
      }
      
      // Portfolio command
      if (command.startsWith('/portfolio')) {
        return this.handlePortfolio(senderAddress)
      }
      
      // Join command
      if (command.startsWith('/join')) {
        const roundId = command.split(' ')[1]
        return this.handleJoin(roundId, senderAddress)
      }
      
      // Leaderboard command
      if (command.startsWith('/leaderboard')) {
        const roundId = command.split(' ')[1]
        return await this.handleLeaderboard(roundId)
      }
      
      // Default response
      return `👋 Hi! I'm your AI trading assistant.\n\n🎮 Try "/rounds" to see competitions\n🧠 Try "/strategy [your strategy]" for analysis\n📋 Send "/help" for all commands`
      
    } catch (error) {
      console.error('❌ Message processing error:', error instanceof Error ? error.message : 'Unknown error')
      return '❌ Something went wrong. Please try again.'
    }
  }

  async handleRounds(): Promise<string> {
    try {
      console.log('📡 API Call: /api/game/list-rounds')
      const response = await axios.post(`${this.backendUrl}/api/game/list-rounds`, {
        status: 'active'
      })
      
      console.log('✅ API Response: /api/game/list-rounds', response.data.success ? 'Success' : 'Error')
      
      if (!response.data.success || response.data.rounds.length === 0) {
        return `🎮 **No Active Rounds**\n\nCheck back soon for trading competitions!\n\n💡 Use /mint to get ARENA$ tokens while you wait.`
      }
      
      const roundsList = response.data.rounds.map((round: any, index: number) => {
        return `${index + 1}. **${round.title}**\n   • Players: ${round.currentParticipants}/${round.maxParticipants}\n   • Status: ${round.status}\n   • ID: ${round.id}`
      }).join('\n\n')
      
      return `🎮 **Active Trading Rounds**\n\n${roundsList}\n\n💡 Use "/join [roundId]" to compete!\nExample: /join ${response.data.rounds[0].id}`
      
    } catch (error) {
      console.error('❌ Rounds API error:', error instanceof Error ? error.message : 'Unknown error')
      return '❌ Error fetching rounds. Please try again.'
    }
  }

  async handleStrategy(strategy: string): Promise<string> {
    if (!strategy) {
      return `🧠 **Strategy Analysis**\n\nPlease provide your strategy after the command.\n\n💡 Example:\n/strategy Buy DEGEN when RSI < 30 and volume spikes\n\nI'll analyze it with AI!`
    }
    
    try {
      console.log('📡 API Call: /api/trading/parse-strategy')
      const response = await axios.post(`${this.backendUrl}/api/trading/parse-strategy`, {
        strategy
      })
      
      console.log('✅ API Response: /api/trading/parse-strategy', response.data.success ? 'Success' : 'Error')
      
      if (!response.data.success) {
        return '❌ Error analyzing strategy. Please try again.'
      }
      
      const parsed = response.data.strategy
      return `🧠 **Strategy Analysis Results**\n\n**Type:** ${parsed.strategy_type}\n**Indicators:** ${parsed.indicators.join(', ')}\n**Entry:** ${parsed.entry_conditions}\n**Exit:** ${parsed.exit_conditions}\n**Risk:** ${parsed.risk_management}\n**Confidence:** ${parsed.confidence}/10\n**Recommended Tokens:** ${parsed.suggested_base_tokens.join(', ')}\n\n💡 Use this strategy in /join to compete!`
      
    } catch (error) {
      console.error('❌ Strategy API error:', error instanceof Error ? error.message : 'Unknown error')
      return '❌ Error analyzing strategy. Please try again.'
    }
  }

  async handleSignals(symbol: string): Promise<string> {
    try {
      console.log(`📡 API Call: /api/trading/base-signal for ${symbol}`)
      const response = await axios.post(`${this.backendUrl}/api/trading/base-signal`, {
        symbol: symbol.toUpperCase(),
        strategy: 'Technical analysis with RSI and volume indicators'
      })
      
      console.log('✅ API Response: /api/trading/base-signal', response.data.success ? 'Success' : 'Error')
      
      if (!response.data.success) {
        return `❌ Error getting signals for ${symbol}. Please try again.`
      }
      
      const signal = response.data.signal
      const market = response.data.marketData
      
      return `📊 **${symbol.toUpperCase()} Trading Signal**\n\n🎯 **Signal:** ${signal.signal}\n📈 **Confidence:** ${signal.confidence}/10\n💰 **Current Price:** $${market.price}\n📊 **24h Change:** ${market.priceChange24h > 0 ? '+' : ''}${market.priceChange24h.toFixed(2)}%\n💡 **Reasoning:** ${signal.reason}\n\n⚡ **Entry Price:** $${signal.entry_price}\n🛡️ **Stop Loss:** $${signal.stop_loss}\n🎯 **Take Profit:** $${signal.take_profit}\n\n💡 Use this analysis for your trading strategies!`
      
    } catch (error) {
      console.error('❌ Signals API error:', error instanceof Error ? error.message : 'Unknown error')
      return '❌ Error getting trading signals. Please try again.'
    }
  }

  handleMint(address: string): string {
    return `🪙 **Mint Your ARENA$ Tokens**\n\nGet 100 ARENA$ tokens to start trading!\n\n💡 **How to mint:**\n1. Visit your app's mint page\n2. Connect wallet: ${address}\n3. Mint 100 ARENA$ (free!)\n\nOnce minted, use /rounds to join competitions!`
  }

  handlePortfolio(address: string): string {
    return `💼 **Your Portfolio**\n\n🪙 **Gaming Balance:**\nARENA$: Check your app for current balance\n\n🎮 **Active Rounds:**\nUse /rounds to see competitions you can join\n\n💰 **Real Trading:**\nComing soon! Will show your real Base network positions.\n\nWallet: ${address}\n\n💡 Use /mint to get started with gaming!`
  }

  handleJoin(roundId: string | undefined, address: string): string {
    if (!roundId) {
      return `❌ Please specify a round ID.\n\nExample: /join round_123\n\nUse /rounds to see available rounds.`
    }
    
    return `🎮 **Join Round ${roundId}**\n\nTo join this round, please:\n\n1. Share your trading strategy\n2. I'll analyze it with AI\n3. You'll be added to the competition\n\n💡 Example strategy:\n"Buy DEGEN when RSI < 30 and volume increases by 20%. Sell when profit reaches 10% or RSI > 70."\n\nWhat's your strategy?`
  }

  async handleLeaderboard(roundId: string | undefined): Promise<string> {
    if (!roundId) {
      return `❌ Please specify round ID. Example: /leaderboard round_123`
    }

    try {
      console.log(`📡 API Call: /api/game/get-leaderboard for ${roundId}`)
      const response = await axios.post(`${this.backendUrl}/api/game/get-leaderboard`, {
        roundId,
        limit: 10
      })
      
      console.log('✅ API Response: /api/game/get-leaderboard', response.data.success ? 'Success' : 'Error')
      
      if (!response.data.success || response.data.leaderboard.length === 0) {
        return `📊 No participants yet in round ${roundId}`
      }

      const leaderboardText = response.data.leaderboard.map((player: any, index: number) => {
        const emoji = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "📈"
        const pnl = player.pnlPercentage > 0 ? `+${player.pnlPercentage.toFixed(2)}` : player.pnlPercentage.toFixed(2)
        return `${emoji} ${player.username}: ${pnl}%`
      }).join('\n')

      return `📊 **Round ${roundId} Leaderboard**\n\n${leaderboardText}\n\n🎮 Use /join ${roundId} to compete!`

    } catch (error) {
      console.error('❌ Leaderboard API error:', error instanceof Error ? error.message : 'Unknown error')
      return '❌ Error fetching leaderboard. Please try again.'
    }
  }

  getHelpMessage(): string {
    return `🤖 **Trading Agent Commands**

🎮 **Gaming:**
/mint - Get 100 ARENA$ tokens
/rounds - List active trading rounds
/join [roundId] - Join competition
/leaderboard [roundId] - Show rankings
/portfolio - Your balances

🧠 **Strategy:**
/strategy [text] - Analyze strategy with AI
/signals [token] - Get trading signals

💡 **Examples:**
/strategy Buy ETH when RSI < 30
/signals DEGEN
/join round_123

ℹ️ **Help:**
/help - Show this message

💬 Send any command to get started!`
  }
}

// Start the agent
const agent = new TradingAgent()
agent.initialize()

console.log('🚀 XMTP Trading Agent starting...')