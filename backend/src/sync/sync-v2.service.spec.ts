import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SyncEntity } from './dto/sync.dto';
import { SyncService } from './sync.service';

describe('SyncService v2 change feed', () => {
  function subject(results: unknown[]) {
    const query = jest.fn().mockImplementation(() => Promise.resolve(results.shift()));
    const manager = { query };
    const dataSource = { transaction: jest.fn(async (work) => work(manager)) };
    return { service: new SyncService(dataSource as never), query, dataSource };
  }

  it('drains committed outbox before capturing high watermark', async () => {
    const { service, query } = subject([[], [{ value: '12' }], []]);
    const result = await service.pullEntityV2(SyncEntity.CLIENTES, { cursor: '0', limit: 2 }, 'tenant-a');
    expect(query.mock.calls[0][0]).toContain('drain_sync_outbox');
    expect(result.meta).toEqual({ hasMore: false, nextCursor: '0', highWatermark: '12' });
  });

  it('uses limit + 1, stable high watermark, and bigint strings on resume', async () => {
    const rows = [
      { revision: '9007199254740993', operation: 'UPSERT', payload: { uuid: 'a' } },
      { revision: '9007199254740994', operation: 'DELETE', payload: { uuid: 'b' } },
      { revision: '9007199254740995', operation: 'UPSERT', payload: { uuid: 'c' } },
    ];
    const { service, query } = subject([[], rows]);
    const result = await service.pullEntityV2(
      SyncEntity.PEDIDOS,
      { cursor: '9007199254740992', highWatermark: '9007199254740999', limit: 2 },
      'tenant-a',
    );
    expect(query.mock.calls[1][1]).toEqual([
      'tenant-a', SyncEntity.PEDIDOS, '9007199254740992', '9007199254740999', 3,
    ]);
    expect(result.data).toHaveLength(2);
    expect(result.data[1].operation).toBe('DELETE');
    expect(result.meta).toEqual({ hasMore: true, nextCursor: '9007199254740994', highWatermark: '9007199254740999' });
  });

  it('keeps tenant and entity in every feed query', async () => {
    const { service, query } = subject([[], [{ value: '0' }], []]);
    await service.pullEntityV2(SyncEntity.PRODUTOS, { cursor: '0', limit: 10 }, 'tenant-isolated');
    expect(query.mock.calls[1][1]).toEqual(['tenant-isolated', SyncEntity.PRODUTOS]);
    expect(query.mock.calls[2][1].slice(0, 2)).toEqual(['tenant-isolated', SyncEntity.PRODUTOS]);
  });

  it('does not return a cursor when page query fails', async () => {
    const manager = { query: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ value: '5' }]).mockRejectedValueOnce(new Error('pull failed')) };
    const dataSource = { transaction: (work: (value: typeof manager) => unknown) => work(manager) };
    const service = new SyncService(dataSource as never);
    await expect(service.pullEntityV2(SyncEntity.CLIENTES, { cursor: '2', limit: 2 }, 'tenant-a')).rejects.toThrow('pull failed');
  });
});

describe('0008 sync feed transaction contracts', () => {
  const sql = readFileSync(join(__dirname, '../database/migrations/0008_sync_change_feed.sql'), 'utf8');

  it('captures writes in same transaction and represents soft deletion', () => {
    expect(sql).toContain('AFTER INSERT OR UPDATE');
    expect(sql).toContain("NEW.deleted_at IS NOT NULL THEN 'DELETE'");
  });

  it('serializes concurrent drains and assigns revision only while draining committed rows', () => {
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toMatch(/INSERT INTO public\.sync_changes[\s\S]+FROM moved/);
    expect(sql).not.toMatch(/INSERT INTO public\.sync_changes[\s\S]+capture_sync_outbox/);
  });
});
