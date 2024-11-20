// Populate the sidebar
//
// This is a script, and not included directly in the page, to control the total size of the book.
// The TOC contains an entry for each page, so if each page includes a copy of the TOC,
// the total size of the page becomes O(n**2).
class MDBookSidebarScrollbox extends HTMLElement {
    constructor() {
        super();
    }
    connectedCallback() {
        this.innerHTML = '<ol class="chapter"><li class="chapter-item expanded "><a href="intro.html"><strong aria-hidden="true">1.</strong> Introduction</a></li><li class="chapter-item expanded "><a href="install.html"><strong aria-hidden="true">2.</strong> Installation</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="requirements/kubernetes.html"><strong aria-hidden="true">2.1.</strong> Kubernetes requirements</a></li><li class="chapter-item expanded "><a href="requirements/podman.html"><strong aria-hidden="true">2.2.</strong> Podman requirements</a></li><li class="chapter-item expanded "><a href="requirements/native.html"><strong aria-hidden="true">2.3.</strong> Native requirements</a></li></ol></li><li class="chapter-item expanded "><a href="features/index.html"><strong aria-hidden="true">3.</strong> Features by providers</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="features/kubernetes.html"><strong aria-hidden="true">3.1.</strong> Kubernetes</a></li><li class="chapter-item expanded "><a href="features/podman.html"><strong aria-hidden="true">3.2.</strong> Podman</a></li><li class="chapter-item expanded "><a href="features/native.html"><strong aria-hidden="true">3.3.</strong> Native</a></li></ol></li><li class="chapter-item expanded "><a href="cli/index.html"><strong aria-hidden="true">4.</strong> Cli usage</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="cli/convert.html"><strong aria-hidden="true">4.1.</strong> Convert</a></li><li class="chapter-item expanded "><a href="cli/setup.html"><strong aria-hidden="true">4.2.</strong> Setup</a></li><li class="chapter-item expanded "><a href="cli/spawn.html"><strong aria-hidden="true">4.3.</strong> Spawning</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="cli/env_vars.html"><strong aria-hidden="true">4.3.1.</strong> Using env vars</a></li><li class="chapter-item expanded "><a href="cli/teardown.html"><strong aria-hidden="true">4.3.2.</strong> Teardown</a></li></ol></li><li class="chapter-item expanded "><a href="cli/testing.html"><strong aria-hidden="true">4.4.</strong> Testing</a></li></ol></li><li class="chapter-item expanded "><a href="guide.html"><strong aria-hidden="true">5.</strong> Guide (examples)</a></li><li class="chapter-item expanded "><a href="network-definition-spec.html"><strong aria-hidden="true">6.</strong> Network definition spec</a></li><li class="chapter-item expanded "><a href="cli/test-dsl-definition-spec.html"><strong aria-hidden="true">7.</strong> Testing DSL spec</a></li><li class="chapter-item expanded "><a href="development.html"><strong aria-hidden="true">8.</strong> Development</a></li><li class="chapter-item expanded "><a href="projects.html"><strong aria-hidden="true">9.</strong> Projects</a></li><li class="chapter-item expanded "><a href="acknowledgement.html"><strong aria-hidden="true">10.</strong> Acknowledgement</a></li></ol>';
        // Set the current, active page, and reveal it if it's hidden
        let current_page = document.location.href.toString();
        if (current_page.endsWith("/")) {
            current_page += "index.html";
        }
        var links = Array.prototype.slice.call(this.querySelectorAll("a"));
        var l = links.length;
        for (var i = 0; i < l; ++i) {
            var link = links[i];
            var href = link.getAttribute("href");
            if (href && !href.startsWith("#") && !/^(?:[a-z+]+:)?\/\//.test(href)) {
                link.href = path_to_root + href;
            }
            // The "index" page is supposed to alias the first chapter in the book.
            if (link.href === current_page || (i === 0 && path_to_root === "" && current_page.endsWith("/index.html"))) {
                link.classList.add("active");
                var parent = link.parentElement;
                if (parent && parent.classList.contains("chapter-item")) {
                    parent.classList.add("expanded");
                }
                while (parent) {
                    if (parent.tagName === "LI" && parent.previousElementSibling) {
                        if (parent.previousElementSibling.classList.contains("chapter-item")) {
                            parent.previousElementSibling.classList.add("expanded");
                        }
                    }
                    parent = parent.parentElement;
                }
            }
        }
        // Track and set sidebar scroll position
        this.addEventListener('click', function(e) {
            if (e.target.tagName === 'A') {
                sessionStorage.setItem('sidebar-scroll', this.scrollTop);
            }
        }, { passive: true });
        var sidebarScrollTop = sessionStorage.getItem('sidebar-scroll');
        sessionStorage.removeItem('sidebar-scroll');
        if (sidebarScrollTop) {
            // preserve sidebar scroll position when navigating via links within sidebar
            this.scrollTop = sidebarScrollTop;
        } else {
            // scroll sidebar to current active section when navigating via "next/previous chapter" buttons
            var activeSection = document.querySelector('#sidebar .active');
            if (activeSection) {
                activeSection.scrollIntoView({ block: 'center' });
            }
        }
        // Toggle buttons
        var sidebarAnchorToggles = document.querySelectorAll('#sidebar a.toggle');
        function toggleSection(ev) {
            ev.currentTarget.parentElement.classList.toggle('expanded');
        }
        Array.from(sidebarAnchorToggles).forEach(function (el) {
            el.addEventListener('click', toggleSection);
        });
    }
}
window.customElements.define("mdbook-sidebar-scrollbox", MDBookSidebarScrollbox);
