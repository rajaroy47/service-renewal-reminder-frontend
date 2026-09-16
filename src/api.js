import axios from "axios";

// Vite exposes env vars starting with VITE_ via import.meta.env.
// Falls back to localhost:6200 (matches this project's backend .env PORT).
const API_BASE = import.meta.env.VITE_API || "http://localhost:6200/api";

const api = axios.create({ baseURL: API_BASE });

// Attach the saved JWT (if any) to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("crm_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Centralized 401 handling: any expired/invalid token drops the user back
// to the login screen. We dispatch a custom event so App.jsx can react
// without every call site needing its own try/catch for this case.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem("crm_token");
      localStorage.removeItem("crm_username");
      window.dispatchEvent(new CustomEvent("auth:logout"));
    }
    return Promise.reject(error);
  }
);

export default api;
export { API_BASE };
