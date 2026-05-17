export default function SetupView({ ui }) {
  function openSettings() {
    chrome.runtime.sendMessage({ type: 'depth:open-options' });
  }
  return (
    <div class="state state--setup">
      <h2 class="state__title">{ui.setupTitle}</h2>
      <p class="state__body">
        {ui.setupBody}
      </p>
      <button type="button" class="state__cta" onClick={openSettings}>
        {ui.openSettings}
      </button>
    </div>
  );
}
