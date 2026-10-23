/**
 * Extension Build Script
 * Copies extension source to dist/extension/ and injects build-time configuration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.join(__dirname, '..');
const sourceDir = path.join(rootDir, 'extension');
const targetDir = path.join(rootDir, 'dist', 'extension');

// Configuration
const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
const cacheTtlDays = parseInt(process.env.CACHE_TTL_DAYS || '15', 10);
const cacheMaxEntries = parseInt(process.env.CACHE_MAX_ENTRIES || '100', 10);
const nodeEnv = process.env.NODE_ENV || 'development';

console.log('[Build] Starting extension build...');
console.log(`[Build] Environment: ${nodeEnv}`);
console.log(`[Build] Backend URL: ${backendUrl}`);
console.log(`[Build] Cache TTL: ${cacheTtlDays} days`);
console.log(`[Build] Cache max entries: ${cacheMaxEntries}`);

// Validation
if (nodeEnv === 'production' && backendUrl === 'http://localhost:3000') {
  console.error('[Build] ERROR: Production build cannot use localhost backend URL');
  console.error('[Build] Set BACKEND_URL environment variable to production URL');
  process.exit(1);
}

if (nodeEnv === 'production' && !backendUrl.startsWith('https://')) {
  console.warn('[Build] WARNING: Production build should use HTTPS backend URL');
}

/**
 * Recursively copy directory
 */
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Replace placeholders in a file
 */
function replacePlaceholders(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf-8');

  for (const [placeholder, value] of Object.entries(replacements)) {
    content = content.replace(new RegExp(placeholder, 'g'), value);
  }

  fs.writeFileSync(filePath, content);
}

/**
 * Process template files
 */
function processTemplate(templatePath, outputPath, replacements) {
  if (!fs.existsSync(templatePath)) {
    console.warn(`[Build] Template file not found: ${templatePath}`);
    return;
  }

  replacePlaceholders(templatePath, replacements);

  // Rename from .template to .js (remove .template suffix)
  const finalPath = templatePath.replace('.template', '');
  fs.renameSync(templatePath, finalPath);
  console.log(`[Build] Generated: ${finalPath}`);
}

// Clean target directory
if (fs.existsSync(targetDir)) {
  console.log('[Build] Cleaning target directory...');
  fs.rmSync(targetDir, { recursive: true, force: true });
}

// Copy source to target
console.log('[Build] Copying extension files...');
copyDir(sourceDir, targetDir);

// Process config template
const configTemplatePath = path.join(targetDir, 'background', 'config.js.template');
const configReplacements = {
  '{{BACKEND_URL}}': backendUrl,
  '{{CACHE_TTL_DAYS}}': cacheTtlDays,
  '{{CACHE_MAX_ENTRIES}}': cacheMaxEntries,
};
processTemplate(configTemplatePath, configTemplatePath, configReplacements);

// Process translation-cache template
const cacheTemplatePath = path.join(targetDir, 'background', 'translation-cache.js.template');
const cacheReplacements = {
  '{{CACHE_TTL_DAYS}}': cacheTtlDays,
  '{{CACHE_MAX_ENTRIES}}': cacheMaxEntries,
};
processTemplate(cacheTemplatePath, cacheTemplatePath, cacheReplacements);

console.log('[Build] Extension build completed successfully');
console.log(`[Build] Output directory: ${targetDir}`);
