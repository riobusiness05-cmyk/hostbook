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
  var origin = "https://hostflow-booking.vercel.app";
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

  var containers = document.querySelectorAll("[data-hostflow-restaurant]");
  for (var i = 0; i < containers.length; i++) mount(containers[i]);
})();
