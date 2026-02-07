export const getApiBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_API_BASE) {
    return process.env.NEXT_PUBLIC_API_BASE;
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:8000';
  }

  return window.location.origin.replace(/:\d+$/, ':8000');
};
