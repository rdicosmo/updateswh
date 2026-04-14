/**
 * Unit tests for date utility functions
 */
import { isArchiveUpToDate, parseDate } from '../../src/utils/dateUtils.js';

describe('dateUtils', () => {
    describe('isArchiveUpToDate', () => {
        test('should return true when SWH date is after forge date', () => {
            const forgeDate = '2024-01-01T00:00:00Z';
            const swhDate = '2024-01-02T00:00:00Z';
            expect(isArchiveUpToDate(forgeDate, swhDate)).toBe(true);
        });

        test('should return true when SWH date equals forge date', () => {
            const date = '2024-01-01T00:00:00Z';
            expect(isArchiveUpToDate(date, date)).toBe(true);
        });

        test('should return false when SWH date is before forge date', () => {
            const forgeDate = '2024-01-02T00:00:00Z';
            const swhDate = '2024-01-01T00:00:00Z';
            expect(isArchiveUpToDate(forgeDate, swhDate)).toBe(false);
        });

        test('should account for drift window (1 minute)', () => {
            const forgeDate = '2024-01-01T00:01:00Z';
            const swhDate = '2024-01-01T00:00:30Z'; // 30 seconds before, but within 1 minute window
            expect(isArchiveUpToDate(forgeDate, swhDate)).toBe(true);
        });

        test('should handle different timezone formats', () => {
            const forgeDate = '2024-01-01T00:00:00+00:00';
            const swhDate = '2024-01-01T00:00:00Z';
            expect(isArchiveUpToDate(forgeDate, swhDate)).toBe(true);
        });

        test('should return false for null dates', () => {
            expect(isArchiveUpToDate(null, '2024-01-01T00:00:00Z')).toBe(false);
            expect(isArchiveUpToDate('2024-01-01T00:00:00Z', null)).toBe(false);
            expect(isArchiveUpToDate(null, null)).toBe(false);
        });

        test('should fallback to string comparison for invalid dates', () => {
            const forgeDate = 'invalid-date';
            const swhDate = '2024-01-01T00:00:00Z';
            // Should not throw, should fallback
            expect(() => isArchiveUpToDate(forgeDate, swhDate)).not.toThrow();
        });
    });

    describe('parseDate', () => {
        test('should parse valid ISO date strings', () => {
            const dateStr = '2024-01-01T00:00:00Z';
            const date = parseDate(dateStr);
            expect(date).toBeInstanceOf(Date);
            expect(date.getTime()).toBe(Date.parse(dateStr));
        });

        test('should return null for invalid date strings', () => {
            expect(parseDate('invalid-date')).toBeNull();
            expect(parseDate('')).toBeNull();
        });

        test('should return null for null/undefined', () => {
            expect(parseDate(null)).toBeNull();
            expect(parseDate(undefined)).toBeNull();
        });
    });
});

