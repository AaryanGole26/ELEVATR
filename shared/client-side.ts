export const clientSideBackendUrl =
  process.env.NEXT_PUBLIC_CLIENT_SIDE_BACKEND_URL || "http://127.0.0.1:8000";

export const clientSideFrontendUrl =
  process.env.NEXT_PUBLIC_CLIENT_SIDE_FRONTEND_URL || "http://localhost:5173";

export function getClientSideFrontendRoute(route: string) {
  const cleanRoute = route.startsWith("/") ? route : `/${route}`;
  return `${clientSideFrontendUrl}/#${cleanRoute}`;
}
