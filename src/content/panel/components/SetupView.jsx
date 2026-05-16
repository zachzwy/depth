export default function SetupView() {
  function openSettings() {
    chrome.runtime.sendMessage({ type: 'depth:open-options' });
  }
  return (
    <div class="state state--setup">
      <h2 class="state__title">Set up Depth</h2>
      <p class="state__body">
        You need an Anthropic API key. It stays in your browser and is used only when you open Depth.
      </p>
      <button type="button" class="state__cta" onClick={openSettings}>
        Open Settings
      </button>
    </div>
  );
}
