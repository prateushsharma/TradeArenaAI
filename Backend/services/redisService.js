// services/redisService.js - Updated for Production Redis on Render
const Redis = require('redis');

class RedisService {
  constructor() {
    this.client = null;
    this.subscriber = null;
    this.publisher = null;
    this.isConnected = false;
    
    // Production Redis configuration for Render
    this.config = this.getRedisConfig();
  }

  getRedisConfig() {
    // Check if we have a Redis URL (production)
    if (process.env.REDIS_URL) {
      console.log('📡 Using Redis URL for production connection');
      return {
        url: process.env.REDIS_URL,
        socket: {
          tls: false, // Upstash regular Redis doesn't need TLS
        rejectUnauthorized: false
        }
      };
    }
    
    // Fallback to individual config (development)
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      socket: {
        reconnectDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        connectTimeout: 10000,
        lazyConnect: true
      }
    };
  }

  async connect() {
    try {
      console.log(`🔄 Connecting to Redis...`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      
      // Main client for operations
      this.client = Redis.createClient(this.config);
      
      // Dedicated subscriber for pub/sub
      this.subscriber = this.client.duplicate();
      
      // Dedicated publisher for pub/sub
      this.publisher = this.client.duplicate();

      // Set up error handlers before connecting
      this.setupErrorHandlers();

      // Connect all clients
      await Promise.all([
        this.client.connect(),
        this.subscriber.connect(),
        this.publisher.connect()
      ]);

      this.isConnected = true;
      console.log('✅ Redis service connected successfully');
      console.log(`📍 Redis Host: ${this.config.host || 'URL Connection'}`);

    } catch (error) {
      console.error('❌ Redis connection failed:', error.message);
      this.isConnected = false;
      
      // In production, don't throw - allow app to continue without Redis
      if (process.env.NODE_ENV === 'production') {
        console.warn('⚠️ Production mode: Continuing without Redis');
        return;
      }
      
      throw error;
    }
  }

  setupErrorHandlers() {
    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err.message);
      this.isConnected = false;
    });
    
    this.client.on('connect', () => {
      console.log('🔗 Redis client connected');
      this.isConnected = true;
    });
    
    this.client.on('reconnecting', () => {
      console.log('🔄 Redis client reconnecting...');
    });
    
    this.client.on('ready', () => {
      console.log('✅ Redis client ready');
      this.isConnected = true;
    });
    
    this.subscriber.on('error', (err) => {
      console.error('Redis Subscriber Error:', err.message);
    });
    
    this.publisher.on('error', (err) => {
      console.error('Redis Publisher Error:', err.message);
    });
  }

  async disconnect() {
    if (this.isConnected) {
      try {
        await Promise.all([
          this.client?.quit(),
          this.subscriber?.quit(),
          this.publisher?.quit()
        ]);
        this.isConnected = false;
        console.log('✅ Redis service disconnected');
      } catch (error) {
        console.error('❌ Redis disconnect error:', error.message);
      }
    }
  }

  // Safe operation wrapper
  async safeOperation(operation, fallback = null) {
    if (!this.isConnected) {
      if (process.env.NODE_ENV === 'production') {
        console.warn('⚠️ Redis not connected, returning fallback');
        return fallback;
      }
      throw new Error('Redis not connected');
    }
    
    try {
      return await operation();
    } catch (error) {
      console.error('Redis operation error:', error.message);
      if (process.env.NODE_ENV === 'production') {
        return fallback;
      }
      throw error;
    }
  }

  // Generic Redis operations with safety checks
  async get(key) {
    return await this.safeOperation(
      () => this.client.get(key),
      null
    );
  }

  async set(key, value, options = {}) {
    return await this.safeOperation(() => {
      if (options.ttl) {
        return this.client.setEx(key, options.ttl, value);
      }
      return this.client.set(key, value);
    }, false);
  }

  async del(key) {
    return await this.safeOperation(
      () => this.client.del(key),
      0
    );
  }

  async exists(key) {
    return await this.safeOperation(
      () => this.client.exists(key),
      false
    );
  }

  async hSet(key, field, value) {
    return await this.safeOperation(
      () => this.client.hSet(key, field, value),
      false
    );
  }

  async hGet(key, field) {
    return await this.safeOperation(
      () => this.client.hGet(key, field),
      null
    );
  }

  async hGetAll(key) {
    return await this.safeOperation(
      () => this.client.hGetAll(key),
      {}
    );
  }

  async hDel(key, field) {
    return await this.safeOperation(
      () => this.client.hDel(key, field),
      0
    );
  }

  async sAdd(key, member) {
    return await this.safeOperation(
      () => this.client.sAdd(key, member),
      0
    );
  }

  async sRem(key, member) {
    return await this.safeOperation(
      () => this.client.sRem(key, member),
      0
    );
  }

  async sMembers(key) {
    return await this.safeOperation(
      () => this.client.sMembers(key),
      []
    );
  }

  async zAdd(key, score, member) {
    return await this.safeOperation(
      () => this.client.zAdd(key, { score, value: member }),
      0
    );
  }

  async zRangeByScore(key, min, max) {
    return await this.safeOperation(
      () => this.client.zRangeByScore(key, min, max),
      []
    );
  }

  async zRevRange(key, start, stop) {
    return await this.safeOperation(async () => {
      try {
        // Try newer Redis client method first
        if (this.client.zRevRange) {
          return await this.client.zRevRange(key, start, stop, { WITHSCORES: true });
        }
        
        // Try older method names
        if (this.client.ZREVRANGE) {
          return await this.client.ZREVRANGE(key, start, stop, 'WITHSCORES');
        }
        
        // Manual command approach
        const result = await this.client.sendCommand(['ZREVRANGE', key, start.toString(), stop.toString(), 'WITHSCORES']);
        return result;
        
      } catch (error) {
        console.error('Redis zRevRange error:', error.message);
        console.log('Attempting alternative Redis zRevRange method...');
        
        try {
          // Last resort - use eval command
          const script = `
            local result = redis.call('ZREVRANGE', KEYS[1], ARGV[1], ARGV[2], 'WITHSCORES')
            return result
          `;
          return await this.client.eval(script, 1, key, start.toString(), stop.toString());
        } catch (evalError) {
          console.error('All Redis zRevRange methods failed:', evalError.message);
          return [];
        }
      }
    }, []);
  }

  // Pub/Sub operations
  async publish(channel, message) {
    if (!this.isConnected || !this.publisher) {
      console.warn('Redis publisher not available');
      return 0;
    }
    
    return await this.safeOperation(
      () => this.publisher.publish(channel, JSON.stringify(message)),
      0
    );
  }

  async subscribe(channel, callback) {
    if (!this.isConnected || !this.subscriber) {
      console.warn('Redis not connected, skipping subscription');
      return;
    }
    
    try {
      await this.subscriber.subscribe(channel, (message) => {
        try {
          const data = JSON.parse(message);
          callback(data);
        } catch (error) {
          console.error('Error parsing Redis message:', error);
          callback(message);
        }
      });
    } catch (error) {
      console.error('Redis subscribe error:', error.message);
    }
  }

  async unsubscribe(channel) {
    if (!this.isConnected || !this.subscriber) return;
    return await this.safeOperation(
      () => this.subscriber.unsubscribe(channel),
      false
    );
  }

  async incr(key) {
    return await this.safeOperation(
      () => this.client.incr(key),
      1
    );
  }

  async expire(key, seconds) {
    return await this.safeOperation(
      () => this.client.expire(key, seconds),
      false
    );
  }

  async ttl(key) {
    return await this.safeOperation(
      () => this.client.ttl(key),
      -1
    );
  }

  async keys(pattern) {
    return await this.safeOperation(
      () => this.client.keys(pattern),
      []
    );
  }

  // Batch operations
  async multi() {
    if (!this.isConnected) {
      console.warn('Redis not connected for multi operation');
      return null;
    }
    return this.client.multi();
  }

  // Health check
  async ping() {
    if (!this.isConnected) return 'DISCONNECTED';
    
    try {
      const result = await this.client.ping();
      return result;
    } catch (error) {
      console.error('Redis ping error:', error.message);
      return 'ERROR';
    }
  }

  // Production-safe operations for fallback behavior
  isRedisAvailable() {
    return this.isConnected;
  }

  // Memory fallback storage for when Redis is unavailable
  memoryStorage = new Map();
  
  async getWithFallback(key) {
    if (this.isConnected) {
      return await this.get(key);
    }
    return this.memoryStorage.get(key) || null;
  }

  async setWithFallback(key, value, options = {}) {
    if (this.isConnected) {
      return await this.set(key, value, options);
    }
    this.memoryStorage.set(key, value);
    if (options.ttl) {
      setTimeout(() => {
        this.memoryStorage.delete(key);
      }, options.ttl * 1000);
    }
    return true;
  }
}

module.exports = new RedisService();