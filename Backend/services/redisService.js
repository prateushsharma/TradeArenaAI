// services/redisService.js - Core Redis database service
const Redis = require('redis');

class RedisService {
  constructor() {
    this.client = null;
    this.subscriber = null;
    this.publisher = null;
    this.isConnected = false;
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    };
  }

  async connect() {
    try {
      // Main client for operations
      this.client = Redis.createClient(this.config);
      
      // Dedicated subscriber for pub/sub
      this.subscriber = this.client.duplicate();
      
      // Dedicated publisher for pub/sub
      this.publisher = this.client.duplicate();

      await Promise.all([
        this.client.connect(),
        this.subscriber.connect(),
        this.publisher.connect()
      ]);

      this.isConnected = true;
      console.log('✅ Redis service connected successfully');
      
      // Setup error handlers
      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
        this.isConnected = false;
      });
      
      this.subscriber.on('error', (err) => {
        console.error('Redis Subscriber Error:', err);
      });
      
      this.publisher.on('error', (err) => {
        console.error('Redis Publisher Error:', err);
      });

    } catch (error) {
      console.error('❌ Redis connection failed:', error);
      this.isConnected = false;
      throw error;
    }
  }

  async disconnect() {
    if (this.isConnected) {
      await Promise.all([
        this.client?.quit(),
        this.subscriber?.quit(),
        this.publisher?.quit()
      ]);
      this.isConnected = false;
      console.log('Redis service disconnected');
    }
  }

  // Generic Redis operations with safety checks
  async get(key) {
    if (!this.isConnected) throw new Error('Redis not connected');
    return await this.client.get(key);
  }

  async set(key, value, options = {}) {
    if (!this.isConnected) throw new Error('Redis not connected');
    if (options.ttl) {
      return await this.client.setEx(key, options.ttl, value);
    }
    return await this.client.set(key, value);
  }

  async del(key) {
    if (!this.isConnected) throw new Error('Redis not connected');
    return await this.client.del(key);
  }

  async exists(key) {
    if (!this.isConnected) throw new Error('Redis not connected');
    return await this.client.exists(key);
  }

  async hSet(key, field, value) {
    if (!this.isConnected) throw new Error('Redis not connected');
    return await this.client.hSet(key, field, value);
  }

  async hGet(key, field) {
    if (!this.isConnected) throw new Error('Redis not connected');
    return await this.client.hGet(key, field);
  }

  async hGetAll(key) {
    if (!this.isConnected) throw new Error('Redis not connected');
    return await this.client.hGetAll(key);
  }

  async hDel(key, field) {
    if (!this.isConnected) throw new Error('Redis not connected');
    return await this.client.hDel(key, field);
  }

  async sAdd(key, member) {
    if (!this.isConnected) throw new Error('Redis not connected');
    return await this.client.sAdd(key, member);
  }

  async sRem(key, member) {
    if (!this.isConnected) throw new Error('Redis not connected');
    return await this.client.sRem(key, member);
  }

  async sMembers(key) {
    if (!this.isConnected) throw new Error('Redis not connected');
    return await this.client.sMembers(key);
  }

  async zAdd(key, score, member) {
    if (!this.isConnected) throw new Error('Redis not connected');
    return await this.client.zAdd(key, { score, value: member });
  }

  async zRangeByScore(key, min, max) {
    if (!this.isConnected) throw new Error('Redis not connected');
    return await this.client.zRangeByScore(key, min, max);
  }

  async zRevRange(key, start, stop) {
    if (!this.isConnected) throw new Error('Redis not connected');
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
  }

  // Pub/Sub operations
  async publish(channel, message) {
    if (!this.isConnected || !this.publisher) {
      console.warn('Redis publisher not available');
      return;
    }
    return await this.publisher.publish(channel, JSON.stringify(message));
  }

  async subscribe(channel, callback) {
    if (!this.isConnected || !this.subscriber) {
      console.warn('Redis not connected, skipping subscription');
      return;
    }
    
    await this.subscriber.subscribe(channel, (message) => {
      try {
        const data = JSON.parse(message);
        callback(data);
      } catch (error) {
        console.error('Error parsing Redis message:', error);
        callback(message);
      }
    });
  }

  async unsubscribe(channel) {
    return await this.subscriber.unsubscribe(channel);
  }

  async incr(key) {
    if (!this.isConnected) throw new Error('Redis not connected');
    return await this.client.incr(key);
  }

  async expire(key, seconds) {
    if (!this.isConnected) throw new Error('Redis not connected');
    return await this.client.expire(key, seconds);
  }

  async ttl(key) {
    if (!this.isConnected) throw new Error('Redis not connected');
    return await this.client.ttl(key);
  }

  async keys(pattern) {
    if (!this.isConnected) throw new Error('Redis not connected');
    return await this.client.keys(pattern);
  }

  // Batch operations
  async multi() {
    if (!this.isConnected) throw new Error('Redis not connected');
    return this.client.multi();
  }

  // Health check
  async ping() {
    if (!this.isConnected) return 'DISCONNECTED';
    try {
      return await this.client.ping();
    } catch (error) {
      return 'ERROR';
    }
  }
}

module.exports = new RedisService();