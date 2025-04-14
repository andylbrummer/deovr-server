/**
 * Utility function to add timeout to promises
 * @param {Promise} promise - The promise to add timeout to
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} errorMessage - Error message to throw on timeout
 * @returns {Promise} - Promise with timeout
 */
function promiseWithTimeout(promise, timeoutMs, errorMessage = 'Operation timed out') {
  // Create a promise that rejects after timeoutMs milliseconds
  const timeoutPromise = new Promise((_, reject) => {
    const timeoutId = setTimeout(() => {
      clearTimeout(timeoutId);
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  // Race the original promise against the timeout
  return Promise.race([promise, timeoutPromise]);
}

/**
 * Safely access filesystem with timeout
 * @param {function} fsOperation - Async filesystem operation function to call
 * @param {Array} args - Arguments to pass to the filesystem operation
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} errorMessage - Custom error message for timeout
 * @returns {Promise} - Result of the filesystem operation or error
 */
async function safeFileOperation(fsOperation, args, timeoutMs, errorMessage) {
  try {
    return await promiseWithTimeout(
      fsOperation(...args),
      timeoutMs,
      errorMessage
    );
  } catch (error) {
    // Add a custom property to identify timeout errors
    if (error.message === errorMessage) {
      error.isTimeout = true;
    }
    throw error;
  }
}

module.exports = {
  promiseWithTimeout,
  safeFileOperation
};
