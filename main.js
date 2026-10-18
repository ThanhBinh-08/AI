document.addEventListener("DOMContentLoaded", () => {
  /* ==========================================================================
     1. Background Video Autoplay Assurance
     ========================================================================== */
  const bgVideo = document.querySelector(".bg-video");
  if (bgVideo) {
    bgVideo.muted = true;
    const playPromise = bgVideo.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Fallback for strict browser autoplay policies
        document.body.addEventListener("click", () => bgVideo.play(), { once: true });
      });
    }
  }

  /* ==========================================================================
     2. Stats Count-Up Animation (easeOutCubic, exact timing, IntersectionObserver)
     ========================================================================== */
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const statValues = document.querySelectorAll(".stat-value");
  let statsAnimated = false;

  const animateStat = (el, index) => {
    const target = parseFloat(el.dataset.target);
    const decimals = parseInt(el.dataset.decimals, 10) || 0;
    const suffix = el.dataset.suffix || "";
    const duration = 1500 + index * 80;
    const startDelay = 480 + index * 90;

    setTimeout(() => {
      let startTime = null;

      const step = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const currentVal = easeOutCubic(progress) * target;

        el.textContent = currentVal.toFixed(decimals) + suffix;

        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          el.textContent = target.toFixed(decimals) + suffix;
        }
      };

      requestAnimationFrame(step);
    }, startDelay);
  };

  const statsFooter = document.querySelector(".stats-footer");
  if (statsFooter && statValues.length > 0) {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !statsAnimated) {
            statsAnimated = true;
            obs.unobserve(entry.target);
            statValues.forEach((statEl, idx) => {
              animateStat(statEl, idx);
            });
          }
        });
      },
      { threshold: 0.25 }
    );

    observer.observe(statsFooter);
  }

  /* ==========================================================================
     3. Mobile Menu Toggle (exact interaction)
     ========================================================================== */
  const burgerBtn = document.getElementById("burgerBtn");
  const mobileMenu = document.getElementById("mobileMenu");
  const mobileOverlay = document.getElementById("mobileOverlay");
  const mobileLinks = document.querySelectorAll(".mobile-nav-link, .mobile-signin");

  const openMobileMenu = () => {
    if (!burgerBtn || !mobileMenu || !mobileOverlay) return;
    burgerBtn.setAttribute("aria-expanded", "true");
    mobileOverlay.removeAttribute("hidden");
    mobileMenu.removeAttribute("hidden");
    document.body.classList.add("menu-open");
  };

  const closeMobileMenu = () => {
    if (!burgerBtn || !mobileMenu || !mobileOverlay) return;
    burgerBtn.setAttribute("aria-expanded", "false");
    mobileOverlay.setAttribute("hidden", "");
    mobileMenu.setAttribute("hidden", "");
    document.body.classList.remove("menu-open");
  };

  if (burgerBtn) {
    burgerBtn.addEventListener("click", () => {
      const isExpanded = burgerBtn.getAttribute("aria-expanded") === "true";
      if (isExpanded) {
        closeMobileMenu();
      } else {
        openMobileMenu();
      }
    });
  }

  // Close on overlay click
  if (mobileOverlay) {
    mobileOverlay.addEventListener("click", closeMobileMenu);
  }

  // Close on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && burgerBtn && burgerBtn.getAttribute("aria-expanded") === "true") {
      closeMobileMenu();
    }
  });

  // Close on mobile link click
  mobileLinks.forEach((link) => {
    link.addEventListener("click", () => {
      closeMobileMenu();
    });
  });

  // Close on resize > 720px
  window.addEventListener("resize", () => {
    if (window.innerWidth > 720 && burgerBtn && burgerBtn.getAttribute("aria-expanded") === "true") {
      closeMobileMenu();
    }
  });

  /* ==========================================================================
     4. Navigation Active State Handling
     ========================================================================== */
  const desktopLinks = document.querySelectorAll(".nav-link");
  desktopLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      desktopLinks.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
    });
  });

  mobileLinks.forEach((link) => {
    if (link.classList.contains("mobile-nav-link")) {
      link.addEventListener("click", () => {
        document.querySelectorAll(".mobile-nav-link").forEach((l) => l.classList.remove("active"));
        link.classList.add("active");
      });
    }
  });
});
