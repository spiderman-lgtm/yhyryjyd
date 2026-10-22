/* global chrome, DEALRADAR_API */
// Clicking the toolbar icon on a product page opens the compare panel on the page itself, on any store:
// stores without the panel built in get it added to this tab now. Elsewhere this popup shows.
async function openOnPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\//.test(tab.url || '')) return false;
  const ask = () => chrome.tabs.sendMessage(tab.id, { type: 'openPanel' }).catch(() => null);
  let r = await ask();
  if (!r) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['config.js', 'match.js', 'content.js'] }).catch(() => null);
    r = await ask();
  }
  return !!(r && r.ok);
}
openOnPage().then((opened) => {
  if (opened) window.close();
  else document.getElementById('hint').hidden = false;
});

document.getElementById('deals').href = DEALRADAR_API + '/deals';
document.getElementById('alerts').href = DEALRADAR_API + '/alerts';

document.getElementById('search').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = document.getElementById('q').value.trim();
  if (!v) return;
  const url = /^https?:\/\//i.test(v) ? DEALRADAR_API + '/' + v : DEALRADAR_API + '/search?q=' + encodeURIComponent(v);
  chrome.tabs.create({ url });
});

const auto = document.getElementById('auto');
chrome.storage.local.get('autoOpen').then(({ autoOpen = false }) => (auto.checked = autoOpen));
auto.addEventListener('change', () => chrome.storage.local.set({ autoOpen: auto.checked }));
