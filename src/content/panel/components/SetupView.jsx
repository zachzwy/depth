export default function SetupView() {
  function openSettings() {
    chrome.runtime.sendMessage({ type: 'depth:open-options' });
  }
  return (
    <div class="state state--setup">
      <h2 class="state__title">Set up Depth</h2>
      <p class="state__body">
        Add an OpenAI-compatible API endpoint, model, and key. They stay in this browser and are
        used only when you open Depth.
      </p>
      <button type="button" class="state__cta" onClick={openSettings}>
        Open Settings
      </button>
    </div>
  );
}
