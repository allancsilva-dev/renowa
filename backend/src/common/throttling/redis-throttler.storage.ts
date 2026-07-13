import Redis from 'ioredis';
import type { ThrottlerStorage } from '@nestjs/throttler';

interface StorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

const INCREMENT_SCRIPT = `
local counter = KEYS[1]
local blocked = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

local blockedTtl = redis.call('PTTL', blocked)
if blockedTtl > 0 then
  local hits = tonumber(redis.call('GET', counter) or limit + 1)
  return { hits, redis.call('PTTL', counter), 1, blockedTtl }
end

local hits = redis.call('INCR', counter)
if hits == 1 then redis.call('PEXPIRE', counter, ttl) end
local counterTtl = redis.call('PTTL', counter)

if hits > limit then
  redis.call('SET', blocked, '1', 'PX', blockDuration)
  return { hits, counterTtl, 1, blockDuration }
end

return { hits, counterTtl, 0, 0 }
`;

export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly redis: Redis;

  constructor(url: string) {
    this.redis = new Redis(url, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    });
    this.redis.on('error', () => undefined);
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<StorageRecord> {
    const prefix = `renowa:throttle:${throttlerName}:${key}`;
    const result = await this.redis.eval(
      INCREMENT_SCRIPT, 2, `${prefix}:count`, `${prefix}:blocked`,
      ttl, limit, blockDuration,
    ) as number[];

    return {
      totalHits: Number(result[0]),
      timeToExpire: Math.max(0, Math.ceil(Number(result[1]) / 1000)),
      isBlocked: Number(result[2]) === 1,
      timeToBlockExpire: Math.max(0, Math.ceil(Number(result[3]) / 1000)),
    };
  }
}
