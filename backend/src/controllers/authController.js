const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbGet, dbRun } = require('../config/db');
const { getSuggestionsForProvider } = require('../services/subscriptionSeeder');

if (!process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET environment variable is not defined!');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

// Helper: create JWT
function createToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Helper: build user response object
function userResponse(user) {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name || null,
    avatar_url: user.avatar_url || null,
    auth_provider: user.auth_provider || 'local',
  };
}

// Register User (email/password)
exports.register = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  // Very basic email format verification
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Please provide a valid email address' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long' });
  }

  try {
    // Check if user already exists
    const existingUser = await dbGet('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert user
    const result = await dbRun(
      'INSERT INTO users (email, password, auth_provider) VALUES (?, ?, ?)',
      [email.toLowerCase(), hashedPassword, 'local']
    );

    const newUser = { id: result.id, email: email.toLowerCase(), auth_provider: 'local' };
    const token = createToken(newUser);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: userResponse(newUser),
      isNewUser: true,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error during registration' });
  }
};

// Login User (email/password)
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    // Find user
    const user = await dbGet('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // If user signed up via OAuth and has no password
    if (!user.password) {
      return res.status(400).json({
        message: `This account uses ${user.auth_provider} sign-in. Please use that method instead.`
      });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = createToken(user);

    res.status(200).json({
      message: 'Login successful',
      token,
      user: userResponse(user),
      isNewUser: false,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error during login' });
  }
};

// ─── Google OAuth ───────────────────────────────────────────────────────────
// Verifies Google ID token via Google's tokeninfo endpoint (no SDK needed)
exports.googleAuth = async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ message: 'Google credential token is required' });
  }

  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ message: 'Google OAuth is not configured on the server' });
  }

  try {
    // Verify the ID token with Google
    const verifyRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );

    if (!verifyRes.ok) {
      return res.status(401).json({ message: 'Invalid Google token' });
    }

    const payload = await verifyRes.json();

    // Verify audience matches our client ID
    if (payload.aud !== GOOGLE_CLIENT_ID) {
      return res.status(401).json({ message: 'Token was not issued for this application' });
    }

    const email = payload.email?.toLowerCase();
    if (!email || payload.email_verified !== 'true') {
      return res.status(401).json({ message: 'Google account email is not verified' });
    }

    const displayName = payload.name || email.split('@')[0];
    const avatarUrl = payload.picture || null;
    const providerId = payload.sub; // Google's unique user ID

    // Check if user exists
    let user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
    let isNewUser = false;

    if (!user) {
      // Create new user
      const result = await dbRun(
        `INSERT INTO users (email, auth_provider, provider_id, display_name, avatar_url) 
         VALUES (?, ?, ?, ?, ?)`,
        [email, 'google', providerId, displayName, avatarUrl]
      );
      user = { id: result.id, email, auth_provider: 'google', display_name: displayName, avatar_url: avatarUrl };
      isNewUser = true;
    } else if (user.auth_provider === 'local') {
      // Existing local user logging in with Google — link accounts
      await dbRun(
        `UPDATE users SET auth_provider = 'google', provider_id = ?, display_name = COALESCE(display_name, ?), avatar_url = COALESCE(avatar_url, ?) WHERE id = ?`,
        [providerId, displayName, avatarUrl, user.id]
      );
      user.auth_provider = 'google';
      user.display_name = user.display_name || displayName;
      user.avatar_url = user.avatar_url || avatarUrl;
    }

    const token = createToken(user);

    res.status(200).json({
      message: isNewUser ? 'Account created with Google' : 'Login successful',
      token,
      user: userResponse(user),
      isNewUser,
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ message: 'Internal server error during Google authentication' });
  }
};

// ─── Apple OAuth ────────────────────────────────────────────────────────────
// Verifies Apple ID token by fetching Apple's public keys and verifying JWT
exports.appleAuth = async (req, res) => {
  const { id_token, user: appleUser } = req.body;

  if (!id_token) {
    return res.status(400).json({ message: 'Apple ID token is required' });
  }

  const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID;
  if (!APPLE_CLIENT_ID) {
    return res.status(500).json({ message: 'Apple OAuth is not configured on the server' });
  }

  try {
    // Decode token header to get the key ID (kid)
    const headerB64 = id_token.split('.')[0];
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());

    // Fetch Apple's public keys
    const keysRes = await fetch('https://appleid.apple.com/auth/keys');
    const keysData = await keysRes.json();
    const appleKey = keysData.keys.find(k => k.kid === header.kid);

    if (!appleKey) {
      return res.status(401).json({ message: 'Unable to verify Apple token — key not found' });
    }

    // Convert JWK to PEM for verification
    const pem = jwkToPem(appleKey);

    // Verify the token
    const payload = jwt.verify(id_token, pem, {
      algorithms: ['RS256'],
      audience: APPLE_CLIENT_ID,
      issuer: 'https://appleid.apple.com',
    });

    const email = payload.email?.toLowerCase();
    if (!email) {
      return res.status(401).json({ message: 'Apple account email is not available' });
    }

    const providerId = payload.sub;
    // Apple only sends user info on first auth
    const displayName = appleUser?.name
      ? `${appleUser.name.firstName || ''} ${appleUser.name.lastName || ''}`.trim()
      : email.split('@')[0];

    // Check if user exists
    let user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
    let isNewUser = false;

    if (!user) {
      const result = await dbRun(
        `INSERT INTO users (email, auth_provider, provider_id, display_name) VALUES (?, ?, ?, ?)`,
        [email, 'apple', providerId, displayName]
      );
      user = { id: result.id, email, auth_provider: 'apple', display_name: displayName };
      isNewUser = true;
    } else if (user.auth_provider === 'local') {
      await dbRun(
        `UPDATE users SET auth_provider = 'apple', provider_id = ?, display_name = COALESCE(display_name, ?) WHERE id = ?`,
        [providerId, displayName, user.id]
      );
      user.auth_provider = 'apple';
      user.display_name = user.display_name || displayName;
    }

    const token = createToken(user);

    res.status(200).json({
      message: isNewUser ? 'Account created with Apple' : 'Login successful',
      token,
      user: userResponse(user),
      isNewUser,
    });
  } catch (error) {
    console.error('Apple auth error:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Invalid or expired Apple token' });
    }
    res.status(500).json({ message: 'Internal server error during Apple authentication' });
  }
};

// ─── Subscription Suggestions ───────────────────────────────────────────────
exports.getSubscriptionSuggestions = async (req, res) => {
  const provider = req.query.provider || 'local';
  const suggestions = getSuggestionsForProvider(provider);
  res.status(200).json(suggestions);
};

// ─── Seed Subscriptions ─────────────────────────────────────────────────────
const { seedSubscriptions } = require('../services/subscriptionSeeder');

exports.seedUserSubscriptions = async (req, res) => {
  const userId = req.user.id;
  const { selectedKeys } = req.body;

  if (!Array.isArray(selectedKeys) || selectedKeys.length === 0) {
    return res.status(400).json({ message: 'Please select at least one subscription' });
  }

  try {
    const count = await seedSubscriptions(userId, selectedKeys);
    res.status(201).json({
      message: `${count} subscription(s) added successfully`,
      count,
    });
  } catch (error) {
    console.error('Seed subscriptions error:', error);
    res.status(500).json({ message: 'Failed to seed subscriptions' });
  }
};

// ─── JWK to PEM helper (for Apple token verification) ───────────────────────
// Minimal RSA JWK → PEM conversion without external dependencies
function jwkToPem(jwk) {
  const { n, e } = jwk;

  function base64urlToBuffer(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    return Buffer.from(base64, 'base64');
  }

  function encodeLengthHex(length) {
    if (length < 0x80) return Buffer.from([length]);
    const hex = length.toString(16);
    const lengthOfLength = Math.ceil(hex.length / 2);
    const buf = Buffer.alloc(1 + lengthOfLength);
    buf[0] = 0x80 | lengthOfLength;
    for (let i = 0; i < lengthOfLength; i++) {
      buf[1 + i] = parseInt(hex.substring(i * 2, i * 2 + 2) || '0', 16);
    }
    return buf;
  }

  function derInteger(buf) {
    // Prepend 0x00 if high bit set (to keep positive)
    if (buf[0] & 0x80) buf = Buffer.concat([Buffer.from([0]), buf]);
    return Buffer.concat([Buffer.from([0x02]), encodeLengthHex(buf.length), buf]);
  }

  function derSequence(contents) {
    const inner = Buffer.concat(contents);
    return Buffer.concat([Buffer.from([0x30]), encodeLengthHex(inner.length), inner]);
  }

  function derBitString(content) {
    const inner = Buffer.concat([Buffer.from([0x00]), content]);
    return Buffer.concat([Buffer.from([0x03]), encodeLengthHex(inner.length), inner]);
  }

  const nBuf = base64urlToBuffer(n);
  const eBuf = base64urlToBuffer(e);

  // RSA public key OID
  const rsaOid = Buffer.from([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
    0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]);

  const pubKeyInner = derSequence([derInteger(nBuf), derInteger(eBuf)]);
  const pubKeyInfo = derSequence([rsaOid, derBitString(pubKeyInner)]);

  const pem = `-----BEGIN PUBLIC KEY-----\n${pubKeyInfo.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
  return pem;
}
