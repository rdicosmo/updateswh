/**
 * Date utility functions for comparing repository update dates
 */

/**
 * Check if archive is up to date compared to forge
 * Accounts for potential timezone/rounding differences with a drift window
 * 
 * @param {string} forgeDate - ISO date string from forge API
 * @param {string} swhDate - ISO date string from SWH API
 * @param {number} driftWindowMs - Allowed time difference in milliseconds (default: 60000 = 1 minute)
 * @returns {boolean} - True if archive is up to date (swhDate >= forgeDate within drift window)
 */
export function isArchiveUpToDate(forgeDate, swhDate, driftWindowMs = 60000) {
    if (!forgeDate || !swhDate) {
        return false;
    }
    
    try {
        const forgeTimestamp = Date.parse(forgeDate);
        const swhTimestamp = Date.parse(swhDate);
        
        // Handle invalid dates
        if (isNaN(forgeTimestamp) || isNaN(swhTimestamp)) {
            console.warn('Invalid date strings:', forgeDate, swhDate);
            // Fallback to string comparison for backward compatibility
            return swhDate >= forgeDate;
        }
        
        // Archive is up to date if SWH date is >= forge date (within drift window)
        // This accounts for timezone differences and rounding
        return swhTimestamp >= (forgeTimestamp - driftWindowMs);
    } catch (error) {
        console.error('Error parsing dates:', error, forgeDate, swhDate);
        // Fallback to string comparison
        return swhDate >= forgeDate;
    }
}

/**
 * Parse a date string and return a Date object
 * Handles various ISO date formats
 * 
 * @param {string} dateString - ISO date string
 * @returns {Date|null} - Parsed Date object or null if invalid
 */
export function parseDate(dateString) {
    if (!dateString) {
        return null;
    }
    
    try {
        const parsed = Date.parse(dateString);
        if (isNaN(parsed)) {
            return null;
        }
        return new Date(parsed);
    } catch (error) {
        console.error('Error parsing date:', error, dateString);
        return null;
    }
}

