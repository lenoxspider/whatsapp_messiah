import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetPath = path.resolve(__dirname, '../node_modules/@whiskeysockets/baileys/lib/Utils/validate-connection.js');

if (!fs.existsSync(targetPath)) {
  console.log('[patch-baileys] validate-connection.js not found, skipping patch.');
  process.exit(0);
}

let code = fs.readFileSync(targetPath, 'utf8');

let modified = false;

// 1. Ensure getUserAgent handles SMB_ANDROID
if (!code.includes('isSmbAndroid')) {
  code = code.replace(
    /const getUserAgent = \(config\) => \{([\s\S]*?)const PLATFORM_MAP/,
    `const getUserAgent = (config) => {
    const isAndroid = Boolean(config.browser[1]?.toLowerCase().includes('android'));
    // SMB_ANDROID (10) is required for WhatsApp Business accounts to deliver View-Once messages.
    // With ANDROID or WEB, Business accounts send empty envelopes (no media).
    // Reference: WhiskeySockets/Baileys issue #2782
    const isSmbAndroid = Boolean(config.browser[1]?.toLowerCase().includes('smb'));
    let platform;
    if (isSmbAndroid) {
        platform = proto.ClientPayload.UserAgent.Platform.SMB_ANDROID;
    } else if (isAndroid) {
        platform = proto.ClientPayload.UserAgent.Platform.ANDROID;
    } else {
        platform = proto.ClientPayload.UserAgent.Platform.WEB;
    }
    return {
        appVersion: {
            primary: config.version[0],
            secondary: config.version[1],
            tertiary: config.version[2]
        },
        platform,
        releaseChannel: proto.ClientPayload.UserAgent.ReleaseChannel.RELEASE,
        osVersion: '0.1',
        device: (isAndroid || isSmbAndroid) ? 'Android' : 'Desktop',
        osBuildNumber: '0.1',
        localeLanguageIso6391: 'en',
        mnc: '000',
        mcc: '000',
        localeCountryIso31661Alpha2: config.countryCode
    };
};
const PLATFORM_MAP`
  );
  modified = true;
}

// 2. Ensure webInfo is kept when isSmbAndroid
if (code.includes('if (!isAndroid) {') && !code.includes('if (!isAndroid || isSmbAndroid) {')) {
  code = code.replace(
    'if (!isAndroid) {',
    'if (!isAndroid || isSmbAndroid) {'
  );
  modified = true;
}

// 3. Ensure getPlatformType returns ANDROID_PHONE for SMB
if (!code.includes("platformType.includes('SMB')")) {
  code = code.replace(
    "if (platformType === 'ANDROID') {",
    "if (platformType.includes('ANDROID') || platformType.includes('SMB')) {"
  );
  modified = true;
}

if (modified) {
  fs.writeFileSync(targetPath, code, 'utf8');
  console.log('[patch-baileys] Successfully patched Baileys for WhatsApp Business SMB_ANDROID View-Once support.');
} else {
  console.log('[patch-baileys] Baileys validate-connection.js already patched.');
}
