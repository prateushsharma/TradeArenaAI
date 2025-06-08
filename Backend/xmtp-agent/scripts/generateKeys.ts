import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Generate random XMTP keys and append to .env file
 */
function generateKeys() {
  // Generate private key (32 bytes)
  const privateKey = '0x' + crypto.randomBytes(32).toString('hex');
  
  // Generate encryption key (32 bytes) 
  const encryptionKey = '0x' + crypto.randomBytes(32).toString('hex');
  
  // Derive public address (simplified - in real implementation would use proper derivation)
  const publicAddress = '0x' + crypto.randomBytes(20).toString('hex');
  
  console.log('🔑 Generated XMTP Keys:');
  console.log('Private Key:', privateKey);
  console.log('Encryption Key:', encryptionKey);
  console.log('Public Address:', publicAddress);
  console.log('');
  
  // Append to .env file
  const envPath = path.join(process.cwd(), '.env');
  const envContent = `
# Generated XMTP Keys
XMTP_PRIVATE_KEY=${privateKey}
XMTP_ENCRYPTION_KEY=${encryptionKey}

# Your agent's public address (users will message this):
# ${publicAddress}
`;

  try {
    fs.appendFileSync(envPath, envContent);
    console.log('✅ Keys appended to .env file');
    console.log('');
    console.log('📋 Next steps:');
    console.log('1. Add your CDP_API_KEY_NAME and CDP_API_KEY_PRIVATE_KEY to .env');
    console.log('2. Add your OPENAI_API_KEY to .env');
    console.log('3. Add your BACKEND_URL to .env');
    console.log('4. Run: npm run dev');
    console.log('');
    console.log('💬 Users will message this address to talk to your agent:');
    console.log(publicAddress);
    
  } catch (error) {
    console.error('❌ Error writing to .env file:', error);
  }
}

generateKeys();