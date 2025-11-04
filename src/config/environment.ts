// Environment configuration for Course Offerings API
// Reads from .env file using Vite's import.meta.env
export const environment = {
  courseCatalogBase: import.meta.env.VITE_COURSE_CATALOG_BASE_URL || 'https://ais.kube.ohio.edu/api/course-offerings',
};

// Normalize base URL to handle cases where it might include /search/query
export function normalizeBaseUrl(url: string): string {
  if (!url) {
    return url;
  }
  return url.replace(/\/search\/query\/?$/, '').replace(/\/$/, '');
}

