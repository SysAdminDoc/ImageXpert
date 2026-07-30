const IMAGEXPERT_URL = 'https://sysadmindoc.github.io/ImageXpert/';
const MENU_ID = 'imagexpert-search-image';
const extensionApi = globalThis.browser || globalThis.chrome;

extensionApi.runtime.onInstalled.addListener(() => {
  extensionApi.contextMenus.removeAll(() => {
    extensionApi.contextMenus.create({
      id: MENU_ID,
      title: extensionApi.i18n.getMessage('contextMenuSearch'),
      contexts: ['image']
    });
  });
});

extensionApi.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID || !info.srcUrl) return;
  let source;
  try {
    source = new URL(info.srcUrl);
    if (!['http:', 'https:'].includes(source.protocol) || source.username || source.password) return;
  } catch {
    return;
  }
  extensionApi.tabs.create({
    url: `${IMAGEXPERT_URL}?image=${encodeURIComponent(source.href)}`
  });
});
