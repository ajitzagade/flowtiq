#!/usr/bin/env node
// apply-tenant-config.js
// Reads a tenant config JSON and applies it to native project files.
// Usage: node scripts/apply-tenant-config.js <slug>
// Example: node scripts/apply-tenant-config.js vastudeep

'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_FIELDS = [
  'slug',
  'appName',
  'bundleId',
  'applicationId',
  'webviewUrl',
  'tenantDomain',
  'fcmProjectId',
  'iosTeamId',
  'apnsBundleId',
  'storeName',
  'storeDescription',
];

const ROOT = path.resolve(__dirname, '..');

function die(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function log(message) {
  console.log(`✓ ${message}`);
}

// Escape XML special characters to prevent injection in strings.xml / Info.plist
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Load and validate config ──────────────────────────────────────────────────

const slug = process.argv[2];
if (!slug) {
  die('Usage: node scripts/apply-tenant-config.js <slug>');
}

// Prevent path traversal attacks via the slug argument
if (!/^[a-z0-9-]+$/.test(slug)) {
  die(`Invalid tenant slug: "${slug}" — must match [a-z0-9-]+`);
}

const configPath = path.join(ROOT, 'configs', 'build', 'tenant-configs', `${slug}.json`);
if (!fs.existsSync(configPath)) {
  die(`No config found for tenant slug: ${slug}`);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
  die(`Failed to parse config file: ${err.message}`);
}

for (const field of REQUIRED_FIELDS) {
  if (config[field] === undefined || config[field] === null || config[field] === '') {
    die(`Missing required field in tenant config: ${field}`);
  }
}

// Validate that config.slug matches the filename slug to prevent .env / native file mismatch
if (config.slug !== slug) {
  die(`Slug mismatch: argument is "${slug}" but config.slug is "${config.slug}" — these must match`);
}

// ── Write apps/mobile/.env ────────────────────────────────────────────────────

const envPath = path.join(ROOT, 'apps', 'mobile', '.env');
const envContent = [
  `TENANT_WEBVIEW_URL=${config.webviewUrl}`,
  `TENANT_SLUG=${config.slug}`,
  `TENANT_NAME=${config.appName}`,
  `TENANT_DOMAIN=${config.tenantDomain}`,
  `TENANT_BUNDLE_ID=${config.bundleId}`,
  `TENANT_APPLICATION_ID=${config.applicationId}`,
].join('\n') + '\n';
fs.writeFileSync(envPath, envContent);
log(`Written apps/mobile/.env with TENANT_WEBVIEW_URL=${config.webviewUrl}`);

// ── Update android/app/build.gradle applicationId ────────────────────────────

const gradlePath = path.join(ROOT, 'apps', 'mobile', 'android', 'app', 'build.gradle');
if (!fs.existsSync(gradlePath)) {
  die(`android/app/build.gradle not found at: ${gradlePath}`);
}
const gradleContent = fs.readFileSync(gradlePath, 'utf8');
// Use function form to prevent $1/$2 injection in replacement string
const updatedGradle = gradleContent.replace(
  /applicationId\s+"[^"]+"/,
  () => `applicationId "${config.applicationId}"`
);
if (updatedGradle === gradleContent) {
  console.warn('Warning: applicationId pattern not found in build.gradle — check file format');
} else {
  fs.writeFileSync(gradlePath, updatedGradle);
  log(`Updated android/build.gradle applicationId to ${config.applicationId}`);
}

// ── Update android strings.xml app_name ──────────────────────────────────────

const stringsPath = path.join(
  ROOT, 'apps', 'mobile', 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml'
);
if (!fs.existsSync(stringsPath)) {
  die(`strings.xml not found at: ${stringsPath}`);
}
const stringsContent = fs.readFileSync(stringsPath, 'utf8');
// XML-escape appName and use function form to prevent $-pattern injection
const updatedStrings = stringsContent.replace(
  /<string name="app_name">[^<]*<\/string>/,
  () => `<string name="app_name">${escapeXml(config.appName)}</string>`
);
if (updatedStrings === stringsContent) {
  console.warn('Warning: app_name string not found in strings.xml — check file format');
} else {
  fs.writeFileSync(stringsPath, updatedStrings);
  log(`Updated android/strings.xml app_name to "${config.appName}"`);
}

// ── Update iOS Info.plist CFBundleDisplayName and CFBundleIdentifier ──────────

const infoPlistPath = path.join(
  ROOT, 'apps', 'mobile', 'ios', 'FlowtiqMobile', 'Info.plist'
);
if (!fs.existsSync(infoPlistPath)) {
  die(`Info.plist not found at: ${infoPlistPath}`);
}
let plistContent = fs.readFileSync(infoPlistPath, 'utf8');

// Use function form for replacements and track whether each pattern actually matched
let displayNameMatched = false;
let bundleIdMatched = false;

// XML-escape appName; bundleId is a reverse-DNS string — safe without escaping
plistContent = plistContent.replace(
  /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/,
  (_, pre, post) => { displayNameMatched = true; return pre + escapeXml(config.appName) + post; }
);

plistContent = plistContent.replace(
  /(<key>CFBundleIdentifier<\/key>\s*<string>)[^<]*(<\/string>)/,
  (_, pre, post) => { bundleIdMatched = true; return pre + config.bundleId + post; }
);

if (!displayNameMatched) {
  console.warn('Warning: CFBundleDisplayName not found in Info.plist — check file format');
}
if (!bundleIdMatched) {
  console.warn('Warning: CFBundleIdentifier not found in Info.plist — check file format');
}

fs.writeFileSync(infoPlistPath, plistContent);
log(`Updated ios/Info.plist CFBundleDisplayName to "${config.appName}" and CFBundleIdentifier to "${config.bundleId}"`);

// ── Update ios/fastlane/Appfile ───────────────────────────────────────────────

const appfilePath = path.join(ROOT, 'apps', 'mobile', 'ios', 'fastlane', 'Appfile');
if (fs.existsSync(appfilePath)) {
  const appfileContent = fs.readFileSync(appfilePath, 'utf8');
  const updatedAppfile = appfileContent.replace(
    /app_identifier\("[^"]*"\)/,
    () => `app_identifier("${config.bundleId}")`
  );
  fs.writeFileSync(appfilePath, updatedAppfile);
  log(`Updated ios/fastlane/Appfile app_identifier to ${config.bundleId}`);
}

// ── Update ios/fastlane/Matchfile ─────────────────────────────────────────────

const matchfilePath = path.join(ROOT, 'apps', 'mobile', 'ios', 'fastlane', 'Matchfile');
if (fs.existsSync(matchfilePath)) {
  const matchfileContent = fs.readFileSync(matchfilePath, 'utf8');
  const updatedMatchfile = matchfileContent.replace(
    /app_identifier\(\["[^"]*"\]\)/,
    () => `app_identifier(["${config.bundleId}"])`
  );
  fs.writeFileSync(matchfilePath, updatedMatchfile);
  log(`Updated ios/fastlane/Matchfile app_identifier to ${config.bundleId}`);
}

console.log(`\nTenant config applied: ${config.appName} (${slug})`);
