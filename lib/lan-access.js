const os = require('node:os');
const net = require('node:net');

function normalizeAddress(value) {
  let address = String(value || '').toLowerCase().split('%')[0];
  if (address.startsWith('::ffff:')) address = address.slice(7);
  return address;
}

function isPrivateAddress(value) {
  const address = normalizeAddress(value);
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31 || a === 169 && b === 254;
  }
  if (net.isIPv6(address)) return address === '::1' || /^(fc|fd|fe8|fe9|fea|feb)/.test(address);
  return address === 'localhost';
}

function localAddresses(interfaces = os.networkInterfaces()) {
  return Object.values(interfaces).flat().filter(Boolean).filter(entry => !entry.internal).map(entry => normalizeAddress(entry.address));
}

function requestHost(req) {
  try {
    return new URL(`http://${req.headers.host || ''}`).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    return '';
  }
}

function allowsRequest(req, addresses = localAddresses()) {
  const host = requestHost(req);
  const remote = normalizeAddress(req.socket?.remoteAddress);
  const localHost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || addresses.includes(host);
  const localClient = remote === '127.0.0.1' || remote === '::1' || isPrivateAddress(remote);
  return localHost && localClient;
}

module.exports = { isPrivateAddress, localAddresses, requestHost, allowsRequest };
