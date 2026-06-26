// ==================== Language Support ====================
const LANG = {
  ru: {
    loading: 'Loading all followers...',
    scanning: 'Scanning buttons...',
    found: 'Found: {count} followers',
    progress: 'Unfollowed: {following} | Friend: {friend}',
    done: 'Done - Unfollowed: {following} | Friend: {friend}',
    doneSimple: 'Done - unfollowed {count}',
    noButtons: 'No buttons found. Make sure you are on the Following tab',
    error: 'Error: {error}',
    scrollComplete: 'Scroll complete'
  },
  en: {
    loading: 'Loading all followers...',
    scanning: 'Scanning buttons...',
    found: 'Found: {count} followers',
    progress: 'Unfollowed: {following} | Friend: {friend}',
    done: 'Done - Unfollowed: {following} | Friend: {friend}',
    doneSimple: 'Done - unfollowed {count}',
    noButtons: 'No buttons found. Make sure you are on the Following tab',
    error: 'Error: {error}',
    scrollComplete: 'Scroll complete'
  }
};

let currentLang = 'en';

function t(key, replacements) {
  replacements = replacements || {};
  let text = LANG[currentLang][key] || LANG['en'][key] || key;
  Object.keys(replacements).forEach(function(k) {
    text = text.replace('{' + k + '}', replacements[k]);
  });
  return text;
}

function sendMessage(message) {
  try {
    chrome.runtime.sendMessage(message);
  } catch (e) {
    console.warn('Failed to send message:', e);
  }
}

function log(message) {
  console.log('[TikTok Unfollow]', message);
}

function findScrollableContainer() {
  var selectors = [
    '[data-e2e="scroll-list"]',
    '[data-e2e="recommended-user-list"]',
    '[role="dialog"] [class*="scroll"]',
    '[role="listbox"]',
    '.tiktok-modal',
    'div[style*="overflow-y: auto"]'
  ];

  for (var i = 0; i < selectors.length; i++) {
    try {
      var elements = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < elements.length; j++) {
        if (elements[j].scrollHeight > elements[j].clientHeight + 10) {
          log('Found container: ' + selectors[i]);
          return elements[j];
        }
      }
    } catch (e) {}
  }

  var allDivs = document.querySelectorAll('div');
  for (var k = 0; k < allDivs.length; k++) {
    var style = window.getComputedStyle(allDivs[k]);
    var overflow = style.overflowY || style.overflow;
    if ((overflow === 'auto' || overflow === 'scroll') && allDivs[k].scrollHeight > allDivs[k].clientHeight + 10) {
      log('Found scrollable div');
      return allDivs[k];
    }
  }

  log('Using window scroll');
  return window;
}

function autoScrollToLoadAll(maxScrolls, scrollDelay) {
  maxScrolls = maxScrolls || 50;
  scrollDelay = scrollDelay || 800;
  
  var container = findScrollableContainer();
  var isWindow = container === window;
  var lastHeight = isWindow ? document.documentElement.scrollHeight : container.scrollHeight;
  var scrollCount = 0;
  var noChangeCount = 0;

  return new Promise(function(resolve) {
    var scrollInterval = setInterval(function() {
      if (isWindow) {
        window.scrollTo(0, document.documentElement.scrollHeight);
      } else {
        container.scrollTop = container.scrollHeight;
      }

      scrollCount++;
      var newHeight = isWindow ? document.documentElement.scrollHeight : container.scrollHeight;

      if (newHeight === lastHeight) {
        noChangeCount++;
        if (noChangeCount >= 3) {
          clearInterval(scrollInterval);
          log('Finished scrolling - no more content');
          sendMessage({ action: 'progress', message: t('scrollComplete') });
          resolve();
          return;
        }
      } else {
        noChangeCount = 0;
        log('Height increased: ' + lastHeight + ' -> ' + newHeight);
      }

      lastHeight = newHeight;

      if (scrollCount >= maxScrolls) {
        clearInterval(scrollInterval);
        log('Finished scrolling - max scrolls reached');
        resolve();
        return;
      }
    }, scrollDelay);
  });
}

function isElementVisible(element) {
  if (!element) return false;
  var rect = element.getBoundingClientRect();
  var style = window.getComputedStyle(element);
  return (rect.width > 0 || rect.height > 0) &&
    style.visibility !== 'hidden' &&
    style.display !== 'none' &&
    style.opacity !== '0';
}

function getButtonText(element) {
  var text = (element.innerText || '').trim();
  if (text) return text;
  text = (element.textContent || '').trim();
  if (text) return text;
  text = (element.getAttribute('aria-label') || '').trim();
  if (text) return text;
  return '';
}

function classifyButton(text, element) {
  var lowerText = text.toLowerCase();
  
  if (lowerText.includes('friend') || lowerText.includes('friends') || lowerText.includes('remove')) {
    return 'friend';
  }
  
  if (lowerText.includes('following') || lowerText.includes('unfollow')) {
    return 'following';
  }
  
  var dataE2e = element.getAttribute('data-e2e') || '';
  if (dataE2e.includes('friend')) return 'friend';
  if (dataE2e.includes('follow')) return 'following';
  
  return 'following';
}

function findUnfollowButtons(unfollowFollowing, unfollowFriend) {
  var followingButtons = [];
  var friendButtons = [];

  var selectors = [
    'button[data-e2e*="follow"]',
    'button[data-e2e="unfollow-button"]',
    'button[aria-label*="Follow" i]',
    'button[aria-label*="Following" i]',
    'button[aria-label*="Unfollow" i]',
    'button[aria-label*="Friend" i]',
    'button[class*="follow"]',
    'button[class*="unfollow"]',
    'button',
    '[role="button"]'
  ];

  var seen = new Set();

  for (var i = 0; i < selectors.length; i++) {
    try {
      var elements = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < elements.length; j++) {
        var el = elements[j];
        if (seen.has(el)) continue;
        seen.add(el);
        
        if (!isElementVisible(el)) continue;
        
        var text = getButtonText(el);
        if (!text) continue;
        
        var classification = classifyButton(text, el);
        
        if (classification === 'following' && unfollowFollowing) {
          followingButtons.push(el);
        } else if (classification === 'friend' && unfollowFriend) {
          friendButtons.push(el);
        }
      }
    } catch (e) {}
  }

  log('Found ' + followingButtons.length + ' following buttons, ' + friendButtons.length + ' friend buttons');

  return {
    all: followingButtons.concat(friendButtons),
    following: followingButtons,
    friend: friendButtons
  };
}

function clickButtonSafely(element) {
  try {
    element.click();
    return true;
  } catch (e) {
    try {
      element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    } catch (e2) {
      return false;
    }
  }
}

async function autoUnfollow(unfollowFollowing, unfollowFriend, lang) {
  currentLang = lang || 'en';
  
  try {
    sendMessage({ action: 'progress', message: t('loading') });
    log('Starting auto-unfollow');
    
    await autoScrollToLoadAll(50, 800);
    await new Promise(function(resolve) { setTimeout(resolve, 1000); });
    
    sendMessage({ action: 'progress', message: t('scanning') });
    log('Scanning for buttons...');
    
    var result = findUnfollowButtons(unfollowFollowing, unfollowFriend);
    var buttons = result.all;
    var followingButtons = result.following;
    var friendButtons = result.friend;
    
    log('Found ' + buttons.length + ' total buttons');
    
    if (buttons.length === 0) {
      var errorMsg = t('noButtons');
      sendMessage({ action: 'error', message: errorMsg });
      return { success: false, count: 0, message: errorMsg };
    }
    
    sendMessage({
      action: 'totalFound',
      count: buttons.length,
      candidates: buttons.length + 10,
      followingCount: followingButtons.length,
      friendCount: friendButtons.length
    });
    
    var followingUnfollowed = 0;
    var friendUnfollowed = 0;
    var successCount = 0;
    
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var isFollowing = i < followingButtons.length;
      
      log('Unfollowing ' + (isFollowing ? 'following' : 'friend') + ' #' + (i + 1) + '/' + buttons.length);
      
      var clicked = clickButtonSafely(btn);
      if (clicked) {
        successCount++;
        if (isFollowing) {
          followingUnfollowed++;
        } else {
          friendUnfollowed++;
        }
      }
      
      sendMessage({
        action: 'progress',
        count: i + 1,
        followingCount: followingUnfollowed,
        friendCount: friendUnfollowed,
        totalExpected: buttons.length
      });
      
      if (i < buttons.length - 1) {
        await new Promise(function(resolve) { setTimeout(resolve, 2000); });
      }
    }
    
    sendMessage({
      action: 'done',
      count: successCount,
      followingCount: followingUnfollowed,
      friendCount: friendUnfollowed
    });
    
    log('Completed: ' + successCount + ' unfollows');
    
    return {
      success: true,
      count: successCount,
      followingCount: followingUnfollowed,
      friendCount: friendUnfollowed
    };
    
  } catch (error) {
    log('Error:', error);
    sendMessage({ action: 'error', message: error.message || 'Unknown error' });
    return { success: false, count: 0, message: error.message };
  }
}

// ==================== Message Listener ====================
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'startUnfollow') {
    log('Received start request');
    
    sendResponse({ success: true, message: 'Process started' });
    
    autoUnfollow(
      request.unfollowFollowing,
      request.unfollowFriend,
      request.lang || 'en'
    )
    .then(function(result) {
      chrome.runtime.sendMessage({
        action: 'done',
        count: result.count || 0,
        followingCount: result.followingCount || 0,
        friendCount: result.friendCount || 0,
        success: result.success,
        message: result.message
      });
    })
    .catch(function(error) {
      chrome.runtime.sendMessage({
        action: 'error',
        message: error.message || 'Unknown error'
      });
    });
    
    return false;
  }
});

log('Content script loaded');