const COACH_TOOLS_URL = 'https://rselibiomd.github.io/dragon-boat-training-builder/';

chrome.action.onClicked.addListener(() => {
  chrome.windows.create({
    url: COACH_TOOLS_URL,
    type: 'popup',
    width: 1500,
    height: 980,
    focused: true
  });
});
