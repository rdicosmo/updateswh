#!/usr/bin/env node

/**
 * Manifest generator for browser extension
 * Generates manifest.json (V2) and manifest-v3.json (V3) from a single source
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseManifestPath = path.join(__dirname, '../src/manifest-base.json');
const outputDir = path.join(__dirname, '../extension');

function generateManifest(version) {
    const baseManifest = JSON.parse(fs.readFileSync(baseManifestPath, 'utf8'));
    const manifest = {
        name: baseManifest.name,
        version: baseManifest.version,
        description: baseManifest.description,
        icons: baseManifest.icons,
        manifest_version: version
    };

    if (version === 2) {
        manifest.browser_action = baseManifest.browser_action_v2;
        manifest.background = baseManifest.background_v2;
        manifest.content_security_policy = baseManifest.content_security_policy_v2;
        manifest.web_accessible_resources = baseManifest.web_accessible_resources_v2;
        manifest.options_ui = baseManifest.options_ui_v2;
        manifest.permissions = [
            ...baseManifest.permissions,
            ...baseManifest.host_permissions
        ];
        if (baseManifest.optional_permissions) {
            manifest.optional_permissions = baseManifest.optional_permissions;
        }
    } else if (version === 3) {
        manifest.action = baseManifest.action_v3;
        manifest.background = baseManifest.background_v3;
        manifest.content_security_policy = baseManifest.content_security_policy_v3;
        if (baseManifest.web_accessible_resources_v3) {
            manifest.web_accessible_resources = baseManifest.web_accessible_resources_v3;
        }
        manifest.options_ui = baseManifest.options_ui_v3;
        manifest.permissions = baseManifest.permissions;
        manifest.host_permissions = baseManifest.host_permissions;
        if (baseManifest.optional_permissions) {
            manifest.optional_host_permissions = baseManifest.optional_permissions;
        }
    }

    manifest.content_scripts = baseManifest.content_scripts;

    return manifest;
}

// Generate V2 manifest
const manifestV2 = generateManifest(2);
fs.writeFileSync(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify(manifestV2, null, 2) + '\n'
);

// Generate V3 manifest
const manifestV3 = generateManifest(3);
fs.writeFileSync(
    path.join(outputDir, 'manifest-v3.json'),
    JSON.stringify(manifestV3, null, 2) + '\n'
);

console.log('Manifests generated successfully');

