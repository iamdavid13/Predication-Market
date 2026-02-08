export const getApiBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_API_BASE) {
    return process.env.NEXT_PUBLIC_API_BASE;
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:8000';
  }

  const origin = window.location.origin;

  // GitHub Codespaces: URL pattern is https://...-PORT.app.github.dev
  // Replace the port number embedded in the hostname
  if (origin.includes('.app.github.dev')) {
    return origin.replace(/-\d+\.app\.github\.dev/, '-8000.app.github.dev');
  }

  // Local development: replace port suffix
  return origin.replace(/:\d+$/, ':8000');
};
