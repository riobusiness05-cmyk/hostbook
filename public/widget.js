/**
 * Host Flow booking widget loader.
 *
 * Install on any website:
 *   <div data-hostflow-restaurant="your-restaurant-slug"></div>
 *   <script src="https://<your-hostflow-domain>/widget.js" async></script>
 *
 * Finds every element carrying `data-hostflow-restaurant` and fills it with
 * an iframe pointed at that restaurant's booking page. The origin is read
 * from this script's own `src` (via document.currentScript) rather than
 * hardcoded, so the same file works unmodified on whatever domain Host
 * Flow is actually deployed to.
 */
(function () {
  var thisScript = document.currentScript;
  var origin = "https://hostflow.space";
  if (thisScript && thisScript.src) {
    try {
      origin = new URL(thisScript.src).origin;
    } catch (e) {
      /* fall back to the default above */
    }
  }

  function mount(el) {
    if (el.getAttribute("data-hostflow-mounted") === "1") return; // avoid double-mounting on re-runs
    var slug = el.getAttribute("data-hostflow-restaurant");
    if (!slug) return;

    var iframe = document.createElement("iframe");
    iframe.src = origin + "/widget/" + encodeURIComponent(slug);
    iframe.title = "Book a table";
    iframe.loading = "lazy";
    iframe.style.width = "100%";
    iframe.style.border = "0";
    iframe.style.minHeight = el.getAttribute("data-hostflow-height") || "760px";
    iframe.style.display = "block";

    el.setAttribute("data-hostflow-mounted", "1");
    el.appendChild(iframe);
  }

  function mountAll() {
    var containers = document.querySelectorAll("[data-hostflow-restaurant]");
    for (var i = 0; i < containers.length; i++) mount(containers[i]);
  }

  // Mount whatever is on the page now…
  mountAll();

  // …and keep watching. On a React/Vue/Next site the container is often
  // drawn AFTER this script has run (client-side rendering, a section that
  // mounts on scroll, a page change in a single-page app), so a one-shot
  // scan leaves the booking box empty forever.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountAll);
  }
  window.addEventListener("load", mountAll);
  if (typeof MutationObserver !== "undefined") {
    var observer = new MutationObserver(function () { mountAll(); });
    var start = function () { observer.observe(document.documentElement, { childList: true, subtree: true }); };
    if (document.documentElement) start(); else document.addEventListener("DOMContentLoaded", start);
  } else {
    // Very old browsers: poll for a little while instead.
    var tries = 0;
    var timer = setInterval(function () { mountAll(); if (++tries > 40) clearInterval(timer); }, 500);
  }

  // Sites that render the container themselves and later want to re-mount
  // (e.g. after a client-side route change) can call this directly.
  window.HostFlowWidget = { mount: mountAll };
})();
