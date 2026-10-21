/* global chrome, DEALRADAR_API */
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
chrome.storage.local.get('autoOpen').then(({ autoOpen = true }) => (auto.checked = autoOpen));
auto.addEventListener('change', () => chrome.storage.local.set({ autoOpen: auto.checked }));
