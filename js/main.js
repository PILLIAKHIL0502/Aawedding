/* main.js — boots the app once every module script has registered. */
(function () {
  const boot = () => window.App && window.App.start();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
