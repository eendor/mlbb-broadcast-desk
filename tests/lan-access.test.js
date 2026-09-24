const test = require('node:test');
const assert = require('node:assert/strict');
const LAN = require('../lib/lan-access');

test('private IPv4 and local IPv6 addresses are recognized', () => {
  for (const address of ['10.0.0.4', '172.16.0.1', '172.31.255.254', '192.168.1.9', '169.254.3.8', '::1', 'fd12::4', 'fe80::1', '::ffff:192.168.1.9']) assert.equal(LAN.isPrivateAddress(address), true, address);
  for (const address of ['8.8.8.8', '172.32.0.1', '192.167.1.9', '2001:4860:4860::8888']) assert.equal(LAN.isPrivateAddress(address), false, address);
});

test('LAN requests must target this host and originate on a private network', () => {
  const addresses = ['192.168.1.20', 'fd12::20'];
  const request = (host, remote) => ({ headers: { host }, socket: { remoteAddress: remote } });
  assert.equal(LAN.allowsRequest(request('192.168.1.20:3210', '192.168.1.42'), addresses), true);
  assert.equal(LAN.allowsRequest(request('[fd12::20]:3210', 'fd12::42'), addresses), true);
  assert.equal(LAN.allowsRequest(request('localhost:3210', '::1'), addresses), true);
  assert.equal(LAN.allowsRequest(request('192.168.1.21:3210', '192.168.1.42'), addresses), false);
  assert.equal(LAN.allowsRequest(request('192.168.1.20:3210', '8.8.8.8'), addresses), false);
  assert.equal(LAN.allowsRequest(request('attacker.example:3210', '192.168.1.42'), addresses), false);
});

test('control server responds through a private LAN interface', async t => {
  const address = LAN.localAddresses().find(value => LAN.isPrivateAddress(value) && value !== '127.0.0.1' && value !== '::1' && !value.includes(':'));
  if (!address) return t.skip('No private IPv4 interface is available');
  const { app } = require('../server');
  const server = app.listen(0, '0.0.0.0');
  try {
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject));
    const response = await fetch(`http://${address}:${server.address().port}/api/state`);
    assert.equal(response.status, 200);
    assert.equal(typeof (await response.json()).event, 'string');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
