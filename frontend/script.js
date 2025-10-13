// Dark Mode Logic
const themeMenuButton = document.getElementById("theme-menu-button");
const themeMenu = document.getElementById("theme-menu");

if (themeMenuButton && themeMenu) {
  const themeOptions = themeMenu.querySelectorAll("[data-theme]");

  const applyTheme = (theme) => {
    const htmlEl = document.documentElement;
    if (theme === "dark") {
      htmlEl.classList.add("dark");
    } else {
      htmlEl.classList.remove("dark");
    }
  };

  // Check for a saved theme in localStorage or use the system preference.
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme) {
    applyTheme(savedTheme);
  } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    applyTheme("dark");
  }

  // Event listener for the theme menu button.
  themeMenuButton.addEventListener("click", (e) => {
    e.stopPropagation();
    themeMenu.classList.toggle("hidden");
  });

  // Event listeners for each theme option.
  themeOptions.forEach((option) => {
    option.addEventListener("click", (e) => {
      e.preventDefault();
      const selectedTheme = e.target.getAttribute("data-theme");
      if (selectedTheme === "system") {
        localStorage.removeItem("theme");
        applyTheme(
          window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light",
        );
      } else {
        localStorage.setItem("theme", selectedTheme);
        applyTheme(selectedTheme);
      }
      themeMenu.classList.add("hidden");
    });
  });

  // Close the menu if the user clicks anywhere else on the window.
  window.addEventListener("click", () => {
    if (!themeMenu.classList.contains("hidden")) {
      themeMenu.classList.add("hidden");
    }
  });
}
