// ==================== DOM Elements ====================
const status = document.getElementById('status');
const details = document.getElementById('details');
const unfollowBtn = document.getElementById('unfollowBtn');
const unfollowFollowingCheckbox = document.getElementById('unfollowFollowing');
const unfollowFriendCheckbox = document.getElementById('unfollowFriend');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const statsRow = document.getElementById('statsRow');
const statFollowing = document.getElementById('statFollowing');
const statFriend = document.getElementById('statFriend');
const statTotal = document.getElementById('statTotal');
const resetBtn = document.getElementById('resetBtn');

// ==================== Language Support ====================
const LANG = {
  ru: {
    ready: 'Ready to start',
    loading: 'Loading all followers...',
    scanning: 'Scanning buttons...',
    found: 'Found: {count} followers',
    progress: 'Unfollowed: {following} | Friend: {friend}',
    done: 'Done - Unfollowed: {following} | Friend: {friend}',
    doneSimple: 'Done - unfollowed {count}',
    selectOption: 'Please select at least one option',
    error: 'Error: {error}',
    tiktokRequired: 'Please open TikTok first',
    btnStart: 'Start Auto Unfollow',
    btnRunning: 'Unfollowing...',
    btnReset: 'Reset',
    resetDone: 'Settings reset',
    noButtons: 'No buttons found. Make sure you are on the Following tab',
    started: 'Process started'
  },
  en: {
    ready: 'Ready to start',
    loading: 'Loading all followers...',
    scanning: 'Scanning buttons...',
    found: 'Found: {count} followers',
    progress: 'Unfollowed: {following} | Friend: {friend}',
    done: 'Done - Unfollowed: {following} | Friend: {friend}',
    doneSimple: 'Done - unfollowed {count}',
    selectOption: 'Please select at least one option',
    error: 'Error: {error}',
    tiktokRequired: 'Please open TikTok first',
    btnStart: 'Start Auto Unfollow',
    btnRunning: 'Unfollowing...',
    btnReset: 'Reset',
    resetDone: 'Settings reset',
    noButtons: 'No buttons found. Make sure you are on the Following tab',
    started: 'Process started'
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

function updateStatus(message, type, icon) {
  type = type || 'info';
  icon = icon || '⏳';
  status.innerHTML = '';
  
  var iconSpan = document.createElement('span');
  iconSpan.className = 'status-icon';
  iconSpan.textContent = icon;
  status.appendChild(iconSpan);
  
  var textSpan = document.createElement('span');
  textSpan.textContent = message;
  status.appendChild(textSpan);
  
  status.className = '';
  if (type === 'error') status.classList.add('error');
  else if (type === 'success') status.classList.add('success');
}

function updateDetails(message) {
  details.textContent = message || '';
}

function setButtonState(disabled, text) {
  unfollowBtn.disabled = disabled;
  unfollowBtn.textContent = text || (disabled ? t('btnRunning') : t('btnStart'));
}

function updateStats(following, friend, total) {
  statsRow.classList.add('active');
  statFollowing.textContent = following || 0;
  statFriend.textContent = friend || 0;
  statTotal.textContent = total || 0;
}

function updateProgress(percent) {
  if (percent > 0) {
    progressContainer.classList.add('active');
    progressBar.style.width = Math.min(100, percent) + '%';
  } else {
    progressContainer.classList.remove('active');
    progressBar.style.width = '0%';
  }
}

// ==================== Message Listener ====================
chrome.runtime.onMessage.addListener(function(msg, sender) {
  if (!msg || !msg.action) return;
  
  if (msg.action === 'progress') {
    if (typeof msg.message === 'string') {
      updateStatus(msg.message, 'info', '🔄');
    } else if (typeof msg.count === 'number') {
      var following = msg.followingCount || 0;
      var friend = msg.friendCount || 0;
      updateStats(following, friend, following + friend);
      updateStatus(t('progress', { following: following, friend: friend }), 'info', '⏳');
      if (msg.totalExpected) {
        updateProgress((following + friend) / msg.totalExpected * 100);
      }
    }
  } else if (msg.action === 'totalFound') {
    var count = msg.count || 0;
    var following = msg.followingCount || 0;
    var friend = msg.friendCount || 0;
    updateStats(following, friend, count);
    updateStatus(t('found', { count: count }), 'info', '🔍');
    updateProgress(0);
    var detailText = 'Scanned: ' + (msg.candidates || count) + ' buttons - Filtered: ' + count;
    if (following > 0 || friend > 0) {
      detailText += ' (Following: ' + following + ' | Friend: ' + friend + ')';
    }
    updateDetails(detailText);
  } else if (msg.action === 'done') {
    var following = msg.followingCount || 0;
    var friend = msg.friendCount || 0;
    var total = following + friend;
    updateStats(following, friend, total);
    var statusText = following > 0 && friend > 0 
      ? t('done', { following: following, friend: friend })
      : t('doneSimple', { count: total || msg.count || 0 });
    updateStatus(statusText, 'success', '✅');
    updateProgress(100);
    setButtonState(false);
  } else if (msg.action === 'error') {
    updateStatus(msg.message || t('error', { error: 'Unknown' }), 'error', '❌');
    setButtonState(false);
    updateProgress(0);
    updateDetails('');
  }
});

// ==================== Start Button ====================
unfollowBtn.addEventListener('click', function() {
  if (!unfollowFollowingCheckbox.checked && !unfollowFriendCheckbox.checked) {
    updateStatus(t('selectOption'), 'error', '⚠️');
    return;
  }

  updateStatus(t('loading'), 'info', '🔄');
  updateDetails('');
  setButtonState(true);
  updateProgress(0);
  statsRow.classList.remove('active');

  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (!tabs || tabs.length === 0) {
      updateStatus(t('tiktokRequired'), 'error', '❌');
      setButtonState(false);
      return;
    }

    var tab = tabs[0];
    if (!tab.url || tab.url.indexOf('tiktok.com') === -1) {
      updateStatus(t('tiktokRequired'), 'error', '❌');
      setButtonState(false);
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      {
        action: 'startUnfollow',
        unfollowFollowing: unfollowFollowingCheckbox.checked,
        unfollowFriend: unfollowFriendCheckbox.checked,
        lang: currentLang
      },
      function(response) {
        if (chrome.runtime.lastError) {
          console.warn('Send error:', chrome.runtime.lastError.message);
          updateStatus(t('started'), 'info', '🔄');
          return;
        }
        if (response && response.success) {
          updateStatus(t('started'), 'info', '🔄');
        } else if (response && response.error) {
          updateStatus(response.error, 'error', '❌');
          setButtonState(false);
        } else {
          updateStatus(t('started'), 'info', '🔄');
        }
      }
    );
  });
});

// ==================== Language Switcher ====================
document.querySelectorAll('.lang-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var lang = btn.dataset.lang;
    if (!lang) return;
    currentLang = lang;
    
    document.querySelectorAll('.lang-btn').forEach(function(b) {
      if (b.dataset.lang === currentLang) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
    
    chrome.storage.local.set({ language: currentLang });
    if (!unfollowBtn.disabled) {
      unfollowBtn.textContent = t('btnStart');
    }
    if (resetBtn) resetBtn.textContent = t('btnReset');
    if (!unfollowBtn.disabled) {
      updateStatus(t('ready'), 'info', '⏳');
    }
  });
});

// ==================== Reset ====================
if (resetBtn) {
  resetBtn.addEventListener('click', function(e) {
    e.preventDefault();
    chrome.storage.local.clear(function() {
      unfollowFollowingCheckbox.checked = true;
      unfollowFriendCheckbox.checked = false;
      currentLang = 'en';
      document.querySelectorAll('.lang-btn').forEach(function(btn) {
        if (btn.dataset.lang === 'en') {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      unfollowBtn.textContent = t('btnStart');
      updateStatus(t('resetDone'), 'success', '🔄');
      updateDetails('');
      updateProgress(0);
      statsRow.classList.remove('active');
      setButtonState(false);
      chrome.storage.local.set({ unfollowFollowing: true, unfollowFriend: false, language: 'en' });
    });
  });
}

// ==================== Save Settings ====================
function saveCheckboxState() {
  chrome.storage.local.set({
    unfollowFollowing: unfollowFollowingCheckbox.checked,
    unfollowFriend: unfollowFriendCheckbox.checked
  });
}

unfollowFollowingCheckbox.addEventListener('change', saveCheckboxState);
unfollowFriendCheckbox.addEventListener('change', saveCheckboxState);

// ==================== Load Settings ====================
function loadSettings() {
  chrome.storage.local.get(['unfollowFollowing', 'unfollowFriend', 'language'], function(data) {
    if (data.unfollowFollowing !== undefined) {
      unfollowFollowingCheckbox.checked = data.unfollowFollowing;
    }
    if (data.unfollowFriend !== undefined) {
      unfollowFriendCheckbox.checked = data.unfollowFriend;
    }
    if (data.language) {
      currentLang = data.language;
      document.querySelectorAll('.lang-btn').forEach(function(btn) {
        if (btn.dataset.lang === currentLang) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      unfollowBtn.textContent = t('btnStart');
      if (resetBtn) resetBtn.textContent = t('btnReset');
    }
  });
}

// ==================== Init ====================
loadSettings();
updateStatus(t('ready'), 'info', '⏳');
console.log('TikTok Unfollow loaded. Language:', currentLang);