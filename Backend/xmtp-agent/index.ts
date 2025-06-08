// index.ts - Based on Official XMTP Coinbase AgentKit Example
import * as fs from "fs";
import {
  AgentKit,
  cdpApiActionProvider,
  cdpWalletActionProvider,
  CdpWalletProvider,
  erc20ActionProvider,
  walletActionProvider,
} from "@coinbase/agentkit";
import { getLangChainTools } from "@coinbase/agentkit-langchain";
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import {
  Client,
  type Conversation,
  type DecodedMessage,
  type XmtpEnv,
  type Signer as XmtpSigner,
} from "@xmtp/node-sdk";
import axios from "axios";
import dotenv from "dotenv";
import { Wallet } from "ethers";
import { arrayify } from "ethers/lib/utils";

dotenv.config();

// Environment validation
function validateEnvironment(requiredVars: string[]) {
  const missing = requiredVars.filter(varName => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  return Object.fromEntries(
    requiredVars.map(varName => [varName, process.env[varName]])
  );
}

const {
  XMTP_PRIVATE_KEY: WALLET_KEY,
  XMTP_ENCRYPTION_KEY: ENCRYPTION_KEY,
  XMTP_ENV,
  CDP_API_KEY_NAME,
  CDP_API_KEY_PRIVATE_KEY,
  NETWORK_ID,
  OPENAI_API_KEY,
  BACKEND_URL
} = validateEnvironment([
  "XMTP_PRIVATE_KEY",
  "XMTP_ENCRYPTION_KEY", 
  "XMTP_ENV",
  "CDP_API_KEY_NAME",
  "CDP_API_KEY_PRIVATE_KEY",
  "NETWORK_ID",
  "OPENAI_API_KEY",
  "BACKEND_URL"
]);

// Storage constants
const XMTP_STORAGE_DIR = ".data/xmtp";
const WALLET_STORAGE_DIR = ".data/wallet";

// Global stores for memory and agent instances
const memoryStore: Record<string, MemorySaver> = {};
const agentStore: Record<string, Agent> = {};

interface AgentConfig {
  configurable: {
    thread_id: string;
  };
}

type Agent = ReturnType<typeof createReactAgent>;

/**
 * Ensure local storage directory exists
 */
function ensureLocalStorage() {
  if (!fs.existsSync(XMTP_STORAGE_DIR)) {
    fs.mkdirSync(XMTP_STORAGE_DIR, { recursive: true });
  }
  if (!fs.existsSync(WALLET_STORAGE_DIR)) {
    fs.mkdirSync(WALLET_STORAGE_DIR, { recursive: true });
  }
}

/**
 * Save wallet data to storage.
 */
function saveWalletData(userId: string, walletData: string) {
  const localFilePath = `${WALLET_STORAGE_DIR}/${userId}.json`;
  try {
    if (!fs.existsSync(localFilePath)) {
      console.log(`💾 Wallet data saved for user ${userId}`);
      fs.writeFileSync(localFilePath, walletData);
    }
  } catch (error) {
    console.error(`Failed to save wallet data: ${error}`);
  }
}

/**
 * Get wallet data from storage.
 */
function getWalletData(userId: string): string | null {
  const localFilePath = `${WALLET_STORAGE_DIR}/${userId}.json`;
  try {
    if (fs.existsSync(localFilePath)) {
      return fs.readFileSync(localFilePath, "utf8");
    }
  } catch (error) {
    console.warn(`Could not read wallet data: ${error}`);
  }
  return null;
}

/**
 * Create a signer from private key
 */
function createSigner(privateKey: string) {
  // This would be implemented based on the XMTP SDK
  // For now, return a basic implementation
  return {
    getIdentifier: async () => ({ identifier: "0x..." }),
    // Add other required signer methods
  };
}

/**
 * Get encryption key from hex
 */
function getEncryptionKeyFromHex(hexKey: string): Uint8Array {
  return new Uint8Array(Buffer.from(hexKey.replace('0x', ''), 'hex'));
}

/**
 * Initialize the XMTP client.
 */
async function initializeXmtpClient() {
  const signer = createSigner(WALLET_KEY);
  const dbEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);

  const identifier = await signer.getIdentifier();
  const address = identifier.identifier;

  const client = await Client.create(signer, {
    dbEncryptionKey,
    env: XMTP_ENV as XmtpEnv,
    dbPath: XMTP_STORAGE_DIR + `/${XMTP_ENV}-${address}`,
  });

  console.log(`🤖 Trading Agent initialized`);
  console.log(`📬 Agent address: ${address}`);
  console.log(`🌐 Environment: ${XMTP_ENV}`);
  console.log(`💬 Send messages to: ${address}`);

  /* Sync the conversations from the network to update the local db */
  console.log("✓ Syncing conversations...");
  await client.conversations.sync();

  return client;
}

/**
 * Initialize the agent with CDP Agentkit + Your Backend Integration
 */
async function initializeAgent(userId: string): Promise<{ agent: Agent; config: AgentConfig }> {
  try {
    const llm = new ChatOpenAI({
      model: "gpt-4o-mini",
      apiKey: OPENAI_API_KEY,
    });

    const storedWalletData = getWalletData(userId);
    console.log(`💼 Wallet data for ${userId}: ${storedWalletData ? "Found" : "Creating new"}`);

    const config = {
      apiKeyName: CDP_API_KEY_NAME,
      apiKeyPrivateKey: CDP_API_KEY_PRIVATE_KEY.replace(/\\n/g, "\n"),
      cdpWalletData: storedWalletData || undefined,
      networkId: NETWORK_ID || "base-sepolia",
    };

    const walletProvider = await CdpWalletProvider.configureWithWallet(config);

    const agentkit = await AgentKit.from({
      walletProvider,
      actionProviders: [
        walletActionProvider(),
        erc20ActionProvider(),
        cdpApiActionProvider({
          apiKeyName: CDP_API_KEY_NAME,
          apiKeyPrivateKey: CDP_API_KEY_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
        cdpWalletActionProvider({
          apiKeyName: CDP_API_KEY_NAME,
          apiKeyPrivateKey: CDP_API_KEY_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      ],
    });

    const tools = await getLangChainTools(agentkit);

    memoryStore[userId] = new MemorySaver();

    const agentConfig: AgentConfig = {
      configurable: { thread_id: userId },
    };

    const agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: memoryStore[userId],
      messageModifier: `
        You are a Trading Agent that helps users with both gaming competitions and real crypto trading.
        
        🎮 GAMING COMMANDS (using external backend):
        - /mint: Help users mint ARENA$ tokens for gaming
        - /rounds: Show active trading competitions  
        - /join [roundId]: Join a trading competition
        - /leaderboard [roundId]: Show competition rankings
        - /strategy [text]: Analyze trading strategies with AI
        - /signals [token]: Get AI trading signals
        - /portfolio: Show gaming balances and positions
        
        💰 REAL TRADING COMMANDS (using CDP AgentKit):
        - /trade [buy/sell] [token] [amount]: Execute real trades on Base network
        - /swap [from] [to] [amount]: Swap tokens
        - /balance [token]: Check real wallet balance
        - /send [amount] [token] [address]: Send tokens
        - /deploy: Deploy tokens or NFTs
        
        🔧 INTEGRATION RULES:
        1. For gaming commands (/mint, /rounds, /join, /strategy, /signals), call the external backend API
        2. For real trading commands (/trade, /swap, /balance, /send), use your CDP AgentKit tools
        3. For /portfolio, combine both gaming and real trading data
        4. Always be helpful and explain what you're doing
        5. If unsure about a command, ask for clarification
        
        Your backend API base URL is: ${BACKEND_URL}
        Your default network is Base. Main token for transactions is USDC.
        
        Be concise, helpful, and security-focused. Always explain the risks of real trading.
      `,
    });

    agentStore[userId] = agent;

    const exportedWallet = await walletProvider.exportWallet();
    const walletDataJson = JSON.stringify(exportedWallet);
    saveWalletData(userId, walletDataJson);

    return { agent, config: agentConfig };
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    throw error;
  }
}

/**
 * Check if message is a gaming command (should use backend API)
 */
function isGamingCommand(message: string): boolean {
  const gamingCommands = ['/mint', '/rounds', '/join', '/leaderboard', '/strategy', '/signals'];
  return gamingCommands.some(cmd => message.toLowerCase().startsWith(cmd));
}

/**
 * Handle gaming commands by calling your backend
 */
async function handleGamingCommand(message: string, senderAddress: string): Promise<string> {
  const command = message.toLowerCase().trim();
  
  try {
    // Rounds command
    if (command.startsWith('/rounds')) {
      console.log('📡 API Call: /api/game/list-rounds');
      const response = await axios.post(`${BACKEND_URL}/api/game/list-rounds`, {
        status: 'active'
      });
      
      if (!response.data.success || response.data.rounds.length === 0) {
        return `🎮 **No Active Rounds**\n\nCheck back soon for trading competitions!\n\n💡 Use /mint to get ARENA$ tokens while you wait.`;
      }
      
      const roundsList = response.data.rounds.map((round: any, index: number) => {
        return `${index + 1}. **${round.title}**\n   • Players: ${round.currentParticipants}/${round.maxParticipants}\n   • ID: ${round.id}`;
      }).join('\n\n');
      
      return `🎮 **Active Trading Rounds**\n\n${roundsList}\n\n💡 Use "/join [roundId]" to compete!`;
    }
    
    // Strategy analysis
    if (command.startsWith('/strategy')) {
      const strategy = message.replace(/^\/strategy\s*/i, '').trim();
      if (!strategy) {
        return `🧠 **Strategy Analysis**\n\nPlease provide your strategy:\n\n💡 Example: /strategy Buy DEGEN when RSI < 30`;
      }
      
      console.log('📡 API Call: /api/trading/parse-strategy');
      const response = await axios.post(`${BACKEND_URL}/api/trading/parse-strategy`, {
        strategy
      });
      
      if (!response.data.success) {
        return '❌ Error analyzing strategy. Please try again.';
      }
      
      const parsed = response.data.strategy;
      return `🧠 **Strategy Analysis**\n\n**Type:** ${parsed.strategy_type}\n**Confidence:** ${parsed.confidence}/10\n**Indicators:** ${parsed.indicators.join(', ')}\n**Entry:** ${parsed.entry_conditions}\n**Exit:** ${parsed.exit_conditions}\n\n💡 Use this strategy in /join to compete!`;
    }
    
    // Signals
    if (command.startsWith('/signals')) {
      const symbol = command.split(' ')[1] || 'ETH';
      
      console.log(`📡 API Call: /api/trading/base-signal for ${symbol}`);
      const response = await axios.post(`${BACKEND_URL}/api/trading/base-signal`, {
        symbol: symbol.toUpperCase(),
        strategy: 'Technical analysis'
      });
      
      if (!response.data.success) {
        return `❌ Error getting signals for ${symbol}`;
      }
      
      const signal = response.data.signal;
      const market = response.data.marketData;
      
      return `📊 **${symbol.toUpperCase()} Signal**\n\n🎯 **${signal.signal}** (${signal.confidence}/10)\n💰 Price: $${market.price}\n📈 24h: ${market.priceChange24h > 0 ? '+' : ''}${market.priceChange24h.toFixed(2)}%\n💡 ${signal.reason}`;
    }
    
    // Mint
    if (command.startsWith('/mint')) {
      return `🪙 **Mint Your ARENA$ Tokens**\n\nGet 100 ARENA$ tokens to start trading!\n\nWallet: ${senderAddress}\n\n💡 Visit your app to mint and start competing!`;
    }
    
    // Join
    if (command.startsWith('/join')) {
      const roundId = command.split(' ')[1];
      if (!roundId) {
        return `❌ Please specify round ID. Example: /join round_123`;
      }
      return `🎮 **Join Round ${roundId}**\n\nTo join, share your trading strategy!\n\n💡 Example: "Buy DEGEN when RSI < 30"\n\nWhat's your strategy?`;
    }
    
    // Leaderboard
    if (command.startsWith('/leaderboard')) {
      const roundId = command.split(' ')[1];
      if (!roundId) {
        return `❌ Please specify round ID. Example: /leaderboard round_123`;
      }
      
      console.log(`📡 API Call: /api/game/get-leaderboard for ${roundId}`);
      const response = await axios.post(`${BACKEND_URL}/api/game/get-leaderboard`, {
        roundId,
        limit: 10
      });
      
      if (!response.data.success || response.data.leaderboard.length === 0) {
        return `📊 No participants yet in round ${roundId}`;
      }
      
      const leaderboardText = response.data.leaderboard.map((player: any, index: number) => {
        const emoji = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "📈";
        const pnl = player.pnlPercentage > 0 ? `+${player.pnlPercentage.toFixed(2)}` : player.pnlPercentage.toFixed(2);
        return `${emoji} ${player.username}: ${pnl}%`;
      }).join('\n');
      
      return `📊 **Round ${roundId} Leaderboard**\n\n${leaderboardText}`;
    }
    
    return "❌ Gaming command not recognized. Try /help for available commands.";
    
  } catch (error) {
    console.error('Gaming command error:', error);
    return '❌ Error connecting to gaming backend. Please try again.';
  }
}

/**
 * Process a message with the agent (real trading) or backend (gaming)
 */
async function processMessage(
  agent: Agent,
  config: AgentConfig,
  message: string,
  senderAddress: string,
): Promise<string> {
  // Check if this is a gaming command
  if (isGamingCommand(message)) {
    return await handleGamingCommand(message, senderAddress);
  }
  
  // Handle help command
  if (message.toLowerCase().trim() === '/help') {
    return `🤖 **Trading Agent Commands**

🎮 **Gaming (ARENA$ Competitions):**
/mint - Get 100 ARENA$ tokens
/rounds - List active competitions
/join [roundId] - Join competition
/leaderboard [roundId] - Show rankings
/strategy [text] - AI strategy analysis
/signals [token] - Trading signals

💰 **Real Trading (Base Network):**
/trade buy ETH 0.1 - Buy tokens
/swap USDC ETH 100 - Swap tokens
/balance - Check wallet balance
/send 10 USDC 0x... - Send tokens

💡 **Examples:**
/strategy Buy DEGEN when RSI < 30
/trade buy DEGEN 50
/swap 100 USDC ETH

Send any command to get started!`;
  }
  
  // For real trading commands, use the CDP agent
  let response = "";
  
  try {
    const stream = await agent.stream(
      { messages: [new HumanMessage(message)] },
      config,
    );

    for await (const chunk of stream) {
      if (chunk && typeof chunk === "object" && "agent" in chunk) {
        const agentChunk = chunk as {
          agent: { messages: Array<{ content: unknown }> };
        };
        response += String(agentChunk.agent.messages[0].content) + "\n";
      }
    }

    return response.trim() || "I understand you want to make a trade, but I need more details. Try `/trade buy ETH 0.1` for example.";
  } catch (error) {
    console.error("Error processing message:", error);
    return "Sorry, I encountered an error while processing your request. Please try again later.";
  }
}

/**
 * Handle incoming XMTP messages
 */
async function handleMessage(
  conversation: Conversation,
  message: DecodedMessage,
) {
  const senderAddress = message.senderInboxId;
  const messageContent = message.content;

  console.log(`📨 ${senderAddress}: ${messageContent}`);

  try {
    // Get or create agent for this user
    let agent = agentStore[senderAddress];
    let config: AgentConfig;

    if (!agent) {
      console.log(`🔄 Initializing agent for user: ${senderAddress}`);
      const agentData = await initializeAgent(senderAddress);
      agent = agentData.agent;
      config = agentData.config;
    } else {
      config = { configurable: { thread_id: senderAddress } };
    }

    // Process the message
    const response = await processMessage(agent, config, messageContent, senderAddress);

    // Send response
    await conversation.send(response);
    console.log(`🤖 Replied: ${response.substring(0, 50)}...`);

  } catch (error) {
    console.error("Error handling message:", error);
    await conversation.send("❌ Something went wrong. Please try again later.");
  }
}

/**
 * Main function to start the agent
 */
async function main() {
  console.log("🚀 Starting Trading Agent with XMTP + Coinbase CDP...");
  
  try {
    // Ensure storage directories exist
    ensureLocalStorage();

    // Initialize XMTP client
    const client = await initializeXmtpClient();

    // Listen for messages
    console.log("👂 Listening for messages...");
    
    client.conversations.streamAllMessages(async (conversation, message) => {
      await handleMessage(conversation, message);
    });

    console.log("✅ Trading Agent is running!");
    console.log("💬 Send messages to start trading!");

  } catch (error) {
    console.error("❌ Failed to start agent:", error);
    process.exit(1);
  }
}

// Start the agent
main().catch(console.error);