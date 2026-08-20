(() => {
  // Public release destinations.
  // DoneBell opens these only after an explicit user click.
  globalThis.DoneBellLinks = Object.freeze({
    supportUrl: "",
    githubRepoUrl: "https://github.com/sinopticus91-bit/DoneBell",
    reportApiEndpoint: "" // reserved for a future opt-in report API with explicit host permission
  });
})();
