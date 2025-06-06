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
      this.client.on('error', (err) => console.error('Redis Client Error:', err));
      this.subscriber.on('error', (err) => console.error('Redis Subscriber Error:', err));
      this.publisher.on('error', (err) => console.error('Redis Publisher Error:', err));

    } catch (error) {
      console.error('❌ Redis connection failed:', error);
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

  // Generic Redis operations
  async get(key) {
    return await this.client.get(key);
  }

  async set(key, value, options = {}) {
    if (options.ttl) {
      return await this.client.setEx(key, options.ttl, value);
    }
    return await this.client.set(key, value);
  }

  async del(key) {
    return await this.client.del(key);
  }

  async exists(key) {
    return await this.client.exists(key);
  }

  async hSet(key, field, value) {
    return await this.client.hSet(key, field, value);
  }

  async hGet(key, field) {
    return await this.client.hGet(key, field);
  }

  async hGetAll(key) {
    return await this.client.hGetAll(key);
  }

  async hDel(key, field) {
    return await this.client.hDel(key, field);
  }

  async sAdd(key, member) {
    return await this.client.sAdd(key, member);
  }

  async sRem(key, member) {
    return await this.client.sRem(key, member);
  }

  async sMembers(key) {
    return await this.client.sMembers(key);
  }

  async zAdd(key, score, member) {
    return await this.client.zAdd(key, { score, value: member });
  }

  async zRangeByScore(key, min, max) {
    return await this.client.zRangeByScore(key, min, max);
  }

  async zRevRange(key, start, stop) {
    return await this.client.zRevRange(key, start, stop, { WITHSCORES: true });
  }

  // Pub/Sub operations
  async publish(channel, message) {
    return await this.publisher.publish(channel, JSON.stringify(message));
  }

  async subscribe(channel, callback) {
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

  // Advanced operations
  async incr(key) {
    return await this.client.incr(key);
  }

  async expire(key, seconds) {
    return await this.client.expire(key, seconds);
  }

  async ttl(key) {
    return await this.client.ttl(key);
  }

  async keys(pattern) {
    return await this.client.keys(pattern);
  }

  // Batch operations
  async multi() {
    return this.client.multi();
  }

  // Health check
  async ping() {
    return await this.client.ping();
  }
}

module.exports = new RedisService();