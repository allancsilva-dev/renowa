import express = require('express');
import request = require('supertest');
import { resolveTrustProxy } from './trust-proxy.config';

describe('resolveTrustProxy', () => {
  it('disables proxy trust by default outside production', () => {
    expect(resolveTrustProxy('development', undefined)).toBe(false);
  });

  it('requires an explicit proxy in production', () => {
    expect(() => resolveTrustProxy('production', undefined)).toThrow(
      'TRUST_PROXY is required in production',
    );
  });

  it.each([
    'true',
    'false',
    '2',
    '0.0.0.0/0',
    '::/0',
    'uniquelocal',
    'linklocal',
    '203.0.113.10',
    '172.30.0.2/99',
    'frontend',
  ])(
    'rejects broad trust value %s',
    (value) => {
      expect(() => resolveTrustProxy('production', value)).toThrow(
        'TRUST_PROXY must contain only explicit private proxy addresses or CIDRs',
      );
    },
  );

  it('parses explicit addresses and CIDRs', () => {
    expect(resolveTrustProxy('production', '172.30.0.2/32, 127.0.0.1')).toEqual([
      '172.30.0.2/32',
      '127.0.0.1',
    ]);
  });

  it('ignores spoofed forwarding headers when peer is not trusted', async () => {
    const app = express();
    app.set('trust proxy', resolveTrustProxy('test', undefined));
    app.get('/', (req, res) => res.json({ ip: req.ip, secure: req.secure }));

    const response = await request(app)
      .get('/')
      .set('X-Forwarded-For', '203.0.113.10')
      .set('X-Forwarded-Proto', 'https');

    expect(response.body.ip).not.toBe('203.0.113.10');
    expect(response.body.secure).toBe(false);
  });

  it('uses normalized forwarding headers from an explicitly trusted peer', async () => {
    const app = express();
    app.set('trust proxy', resolveTrustProxy('test', '127.0.0.1/8,::1/128'));
    app.get('/', (req, res) =>
      res.json({ ip: req.ip, protocol: req.protocol, secure: req.secure }),
    );

    const response = await request(app)
      .get('/')
      .set('X-Forwarded-For', '203.0.113.10')
      .set('X-Forwarded-Proto', 'https');

    expect(response.body).toEqual({
      ip: '203.0.113.10',
      protocol: 'https',
      secure: true,
    });
  });
});
