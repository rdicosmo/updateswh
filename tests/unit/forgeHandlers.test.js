/**
 * Unit tests for forge handler URL pattern matching
 */
import { GitHub } from '../../src/forges/GitHub.js';
import { Bitbucket } from '../../src/forges/Bitbucket.js';
import { GitLab } from '../../src/forges/GitLab.js';
import { Gitea } from '../../src/forges/Gitea.js';
import { findMatchingForge, getDefaultForgeHandlers } from '../../src/forges/index.js';

describe('Forge Handlers', () => {
    describe('GitHub', () => {
        const handler = new GitHub();

        test('should match GitHub repository URLs', () => {
            expect(handler.matches('https://github.com/user/repo')).toBe(true);
            expect(handler.matches('https://github.com/user/repo/issues')).toBe(true);
            expect(handler.matches('http://github.com/user/repo')).toBe(true);
        });

        test('should reject non-repository GitHub URLs', () => {
            expect(handler.matches('https://github.com/features')).toBe(false);
            expect(handler.matches('https://github.com/marketplace')).toBe(false);
            expect(handler.matches('https://github.com/user/repo/search?q=test')).toBe(false);
        });

        test('should extract project information correctly', () => {
            const result = handler.setup('https://github.com/user/repo');
            expect(result.projecturl).toBe('https://github.com/user/repo');
            expect(result.userproject).toBe('user/repo');
            expect(result.forgeapiurl).toBe('https://api.github.com/repos/user/repo');
        });
    });

    describe('GitLab', () => {
        const handler = new GitLab();

        test('should match GitLab repository URLs', () => {
            expect(handler.matches('https://gitlab.com/user/repo')).toBe(true);
            expect(handler.matches('https://gitlab.com/user/repo/-/issues')).toBe(true);
        });

        test('should match GitLab subgroup URLs', () => {
            expect(handler.matches('https://gitlab.com/org/subgroup/project')).toBe(true);
            expect(handler.matches('https://gitlab.com/org/sub1/sub2/project')).toBe(true);
        });

        test('should reject non-repository GitLab URLs', () => {
            expect(handler.matches('https://gitlab.com/explore')).toBe(false);
        });

        test('should encode path correctly for subgroups', () => {
            const result = handler.setup('https://gitlab.com/org/subgroup/project');
            expect(result.userproject).toBe(encodeURIComponent('org/subgroup/project'));
        });
    });

    describe('Bitbucket', () => {
        const handler = new Bitbucket();

        test('should match Bitbucket repository URLs', () => {
            expect(handler.matches('https://bitbucket.org/user/repo')).toBe(true);
        });

        test('should reject non-repository Bitbucket URLs', () => {
            expect(handler.matches('https://bitbucket.org/dashboard')).toBe(false);
            expect(handler.matches('https://bitbucket.org/product')).toBe(false);
        });
    });

    describe('Gitea', () => {
        const handler = new Gitea('https://codeberg.org');

        test('should match Gitea repository URLs', () => {
            expect(handler.matches('https://codeberg.org/user/repo')).toBe(true);
        });

        test('should reject non-repository Gitea URLs', () => {
            expect(handler.matches('https://codeberg.org/user')).toBe(false);
            expect(handler.matches('https://codeberg.org/explore')).toBe(false);
        });
    });

    describe('findMatchingForge', () => {
        const handlers = getDefaultForgeHandlers();

        test('should find GitHub handler', () => {
            const handler = findMatchingForge('https://github.com/user/repo', handlers);
            expect(handler).toBeInstanceOf(GitHub);
        });

        test('should find GitLab handler', () => {
            const handler = findMatchingForge('https://gitlab.com/user/repo', handlers);
            expect(handler).toBeInstanceOf(GitLab);
        });

        test('should find Bitbucket handler', () => {
            const handler = findMatchingForge('https://bitbucket.org/user/repo', handlers);
            expect(handler).toBeInstanceOf(Bitbucket);
        });

        test('should return null for unmatched URLs', () => {
            const handler = findMatchingForge('https://example.com/repo', handlers);
            expect(handler).toBeNull();
        });
    });
});

