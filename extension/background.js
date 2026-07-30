const IMAGEXPERT_URL = 'https://sysadmindoc.github.io/ImageXpert/';
const MENU_ID = 'imagexpert-search-image';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: chrome.i18n.getMessage('contextMenuSearch'),
      contexts: ['image']
    });
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID || !info.srcUrl) return;
  chrome.tabs.create({
    url: `${IMAGEXPERT_URL}?image=${encodeURIComponent(info.srcUrl)}`
  });
});
