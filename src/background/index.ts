// Background service worker
console.log('Background worker started');

// Example listener
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed.');
});
