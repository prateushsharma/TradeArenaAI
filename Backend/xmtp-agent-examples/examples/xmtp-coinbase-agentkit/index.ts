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
import {
  createSigner,
  getEncryptionKeyFromHex,
  logAgentDetails,
  validateEnvironment,
} from "@helpers/client";
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatGroq } from "@langchain/groq";
import {
  Client,
  type Conversation,
  type DecodedMessage,
  type XmtpEnv,
} from "@xmtp/node-sdk";

const {
  WALLET_KEY,
  ENCRYPTION_KEY,
  XMTP_ENV,
  CDP_API_KEY_NAME,
  CDP_API_KEY_PRIVATE_KEY,
  NETWORK_ID,
  GROQ_API_KEY,
} = validateEnvironment([
  "WALLET_KEY",
  "ENCRYPTION_KEY",
  "XMTP_ENV",
  "CDP_API_KEY_NAME",
  "CDP_API_KEY_PRIVATE_KEY",
  "NETWORK_ID",
  "GROQ_API_KEY",
]);

// Storage constants
const XMTP_STORAGE_DIR = ".data/xmtp";
const WALLET_STORAGE_DIR = ".data/wallet";

// Global stores for memory and agent instances
const memoryStore: Record<string, MemorySaver> = {};
const agentStore: Record<string, Agent> = {};

// Rate limiting variables
const lastRequestTime: Record<string, number> = {};
const REQUEST_COOLDOWN = 3000; // 3 seconds between requests per user
const responseCache: Record<string, { response: string; timestamp: number }> = {};
const CACHE_DURATION = 30000; // 30 seconds cache

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
 *
 * @param userId - The unique identifier for the user
 * @param walletData - The wallet data to be saved
 */
function saveWalletData(userId: string, walletData: string) {
  const localFilePath = `${WALLET_STORAGE_DIR}/${userId}.json`;
  try {
    if (!fs.existsSync(localFilePath)) {
      console.log(`Wallet data saved for user ${userId}`);
      fs.writeFileSync(localFilePath, walletData);
    }
  } catch (error) {
    console.error(`Failed to save wallet data to file: ${error as string}`);
  }
}

/**
 * Get wallet data from storage.
 *
 * @param userId - The unique identifier for the user
 * @returns The wallet data as a string, or null if not found
 */
function getWalletData(userId: string): string | null {
  const localFilePath = `${WALLET_STORAGE_DIR}/${userId}.json`;
  try {
    if (fs.existsSync(localFilePath)) {
      return fs.readFileSync(localFilePath, "utf8");
    }
  } catch (error) {
    console.warn(`Could not read wallet data from file: ${error as string}`);
  }
  return null;
}

/**
 * Initialize the XMTP client.
 *
 * @returns An initialized XMTP Client instance
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

  void logAgentDetails(client);

  /* Sync the conversations from the network to update the local db */
  console.log("✓ Syncing conversations...");
  await client.conversations.sync();

  return client;
}

/**
 * Initialize the agent with CDP Agentkit and Groq.
 *
 * @param userId - The unique identifier for the user
 * @returns The initialized agent and its configuration
 */
async function initializeAgent(
  userId: string,
): Promise<{ agent: Agent; config: AgentConfig }> {
  try {
    const llm = new ChatGroq({
      model: "deepseek-r1-distill-llama-70b", // Faster and more efficient than gemma2-9b-it
      temperature: 0.6, // More deterministic responses
      apiKey: GROQ_API_KEY,
      maxRetries: 2,
      maxTokens: 300, // Reduce token usage significantly
      timeout: 20000, // 20 second timeout
    });

    const storedWalletData = getWalletData(userId);
    console.log(
      `Wallet data for ${userId}: ${storedWalletData ? "Found" : "Not found"}`,
    );

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
        You are a DeFi Payment Agent that assists users with sending payments and managing their crypto assets.
        You have access to Coinbase Developer Platform AgentKit tools to interact with the blockchain.

        IMPORTANT GUIDELINES:
        1. ALWAYS use the available tools to check actual wallet balances before responding
        2. When asked for network details, provide complete information including RPC URLs
        3. Be specific and accurate - don't give generic responses
        4. If you request funds from faucet, confirm the transaction was successful
        5. Provide blockchain explorer links when relevant

        NETWORK INFORMATION:
        - You're operating on Base Sepolia testnet
        - Chain ID: 84532
        - RPC URL: https://sepolia.base.org
        - Explorer: https://sepolia.basescan.org
        - Currency Symbol: ETH
        - Your main token for transactions is USDC (address: 0x036CbD53842c5426634e7929541eC2318f3dCF7e)

        AVAILABLE ACTIONS:
        - Check wallet balances (ETH and USDC)
        - Request funds from Base Sepolia faucet
        - Send payments
        - Get wallet address and network details

        Always be helpful, accurate, and use tools to provide real-time blockchain data.
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
 * Process a message with the agent.
 *
 * @param agent - The agent instance to process the message
 * @param config - The agent configuration
 * @param message - The message to process
 * @returns The processed response as a string
 */
async function processMessage(
  agent: Agent,
  config: AgentConfig,
  message: string,
): Promise<string> {
  let response = "";

  try {
    // Check cache first
    const cacheKey = `${config.configurable.thread_id}_${message}`;
    const cached = responseCache[cacheKey];
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log("Returning cached response");
      return cached.response;
    }

    const stream = await agent.stream(
      { messages: [new HumanMessage(message)] },
      config,
    );

    for await (const chunk of stream) {
      if (chunk && typeof chunk === "object" && "agent" in chunk) {
        const agentChunk = chunk as {
          agent: { messages: Array<{ content: string | unknown }> };
        };
        if (agentChunk.agent?.messages?.[0]?.content) {
          response += String(agentChunk.agent.messages[0].content) + "\n";
        }
      }
    }

    response = response.trim();
    
    // Cache the response
    responseCache[cacheKey] = { response, timestamp: Date.now() };
    
    return response;
  } catch (error: any) {
    console.error("Error processing message:", error);
    
    // Provide better fallback responses based on message content
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes("balance")) {
      return "I'm currently experiencing high load. Your wallet address is available on Base Sepolia. You can check your balance directly at https://sepolia.basescan.org";
    }
    
    if (lowerMessage.includes("network") || lowerMessage.includes("rpc")) {
      return `Base Sepolia Network Details:
Network Name: Base Sepolia
RPC URL: https://sepolia.base.org
Chain ID: 84532
Currency Symbol: ETH
Block Explorer: https://sepolia.basescan.org`;
    }
    
    if (lowerMessage.includes("faucet")) {
      return "For Base Sepolia testnet funds, you can visit https://bridge.base.org/deposit or use the Coinbase faucet. Please try again in a moment for automated faucet access.";
    }
    
    return "I'm currently experiencing high demand. Please try again in a few moments, or check your wallet directly on Base Sepolia at https://sepolia.basescan.org";
  }
}

/**
 * Handle incoming XMTP messages.
 *
 * @param message - The decoded XMTP message
 * @param client - The XMTP client instance
 */
async function handleMessage(message: DecodedMessage, client: Client) {
  let conversation: Conversation | null = null;
  try {
    const senderAddress = message.senderInboxId;
    const botAddress = client.inboxId.toLowerCase();

    // Ignore messages from the bot itself
    if (senderAddress.toLowerCase() === botAddress) {
      return;
    }

    // Rate limiting check
    const now = Date.now();
    const lastRequest = lastRequestTime[senderAddress] || 0;
    const timeSinceLastRequest = now - lastRequest;

    if (timeSinceLastRequest < REQUEST_COOLDOWN) {
      console.log(`Rate limiting user ${senderAddress}, ${REQUEST_COOLDOWN - timeSinceLastRequest}ms remaining`);
      
      // Get conversation and send rate limit message
      conversation = (await client.conversations.getConversationById(
        message.conversationId,
      )) as Conversation | null;
      
      if (conversation) {
        await conversation.send(
          `Please wait ${Math.ceil((REQUEST_COOLDOWN - timeSinceLastRequest) / 1000)} seconds before sending another message.`
        );
      }
      return;
    }

    lastRequestTime[senderAddress] = now;

    console.log(
      `Received message from ${senderAddress}: ${message.content as string}`,
    );

    const { agent, config } = await initializeAgent(senderAddress);
    const response = await processMessage(
      agent,
      config,
      String(message.content),
    );

    // Get the conversation and send response
    conversation = (await client.conversations.getConversationById(
      message.conversationId,
    )) as Conversation | null;
    if (!conversation) {
      throw new Error(
        `Could not find conversation for ID: ${message.conversationId}`,
      );
    }
    await conversation.send(response);
    console.debug(`Sent response to ${senderAddress}: ${response}`);
  } catch (error: any) {
    console.error("Error handling message:", error);
    
    // Handle rate limit errors specifically
    if (error.status === 429 || error.message?.includes("rate limit")) {
      console.log("Rate limit hit, implementing backoff...");
      if (conversation) {
        await conversation.send(
          "I'm currently experiencing high demand. Please try again in a few moments."
        );
      }
    } else if (conversation) {
      await conversation.send(
        "I encountered an error while processing your request. Please try again later."
      );
    }
  }
}

/**
 * Start listening for XMTP messages.
 *
 * @param client - The XMTP client instance
 */
async function startMessageListener(client: Client) {
  console.log("Starting message listener...");
  const stream = await client.conversations.streamAllMessages();
  for await (const message of stream) {
    if (message) {
      await handleMessage(message, client);
    }
  }
}

/**
 * Main function to start the chatbot.
 */
async function main(): Promise<void> {
  console.log("Initializing Agent on XMTP with Groq...");

  ensureLocalStorage();

  const xmtpClient = await initializeXmtpClient();
  await startMessageListener(xmtpClient);
}

// Start the chatbot
main().catch(console.error);